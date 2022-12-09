import { InjectQueue } from '@nestjs/bull';
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import Bull, { Queue } from 'bull';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import {
  ElasticSearchSensor,
  ElasticSearchSensorDocument,
} from 'src/models/elasticsearch.sensor';
import { DeviceService } from '../device/device.service';
import { GroupService } from '../group/group.service';
import Redis from 'ioredis';
import { ESDeviceStatus } from 'src/es.models/es.device.status';
import { SearchResponse } from '@elastic/elasticsearch/api/types';
import {
  DeviceType,
  ElasticSearchInput,
  ISensorData,
  SensorType,
  GaugeSensorData,
  TextSensorData,
  SwitchSensorData,
  SnapshotSensorData,
  RecognitionType,
} from 'src/graphql.schema';
import { ApolloError } from 'apollo-server-express';
import { ErrorCode } from 'src/models/error.code';
import { Constants } from 'src/constants';
import StringUtils from 'src/utils/StringUtils';
import {
  MqttOption,
  MqttSensorResponse,
  SensorService,
} from '../sensor/sensor.service';
import { connect, MqttClient } from 'mqtt';
import { Device } from 'src/models/device';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import MQTTHelper from 'src/utils/MQTTHelper';

@Injectable()
export class ElasticsearchSensorService implements OnModuleInit {
  private pubSub: RedisPubSub;

  // remember <projectKey, MqttClient> to add the new topic to the MqttClient
  private mqttClients: Map<string, MqttClient> = new Map();

  // remember <JobID, enable> to interrupt the processing if using deleteFromElasticSearch
  processControl: Map<Bull.JobId, boolean> = new Map();

  // sensorIds for Camera(IVS) events, and they should sync to the elasticsearch with special schema
  private sensorIdsForIVSEvents = [
    // human_shape
    Constants.ID_CAMERA_PEDESTRIAN,
    Constants.ID_CAMERA_GENDER,
    Constants.ID_CAMERA_CLOTHESCOLOR,
    // car_identify
    Constants.ID_CAMERA_VEHICLE,
    Constants.ID_CAMERA_NUMBERPLATE,
    Constants.ID_CAMERA_VEHICLETYPE,
    Constants.ID_CAMERA_VEHICLECOLOR,
    // human_flow_advance
    Constants.ID_CAMERA_HUMAN_FLOW_SEX,
    Constants.ID_CAMERA_HUMAN_FLOW_AGE,
    Constants.ID_CAMERA_HUMAN_FLOW_IMAGE,
    // car_flow
    Constants.ID_CAMERA_CAR_FLOW_STRAIGHT_COUNT,
    Constants.ID_CAMERA_CAR_FLOW_STRAIGHT_IMAGE,
    // human_flow
    Constants.ID_CAMERA_HUMAN_COUNT,
    Constants.ID_CAMERA_HUMAN_IMAGE,
  ];

  constructor(
    @InjectModel(ElasticSearchSensor.name)
    private readonly esSensorModel: Model<ElasticSearchSensorDocument>,
    private readonly configService: ConfigService,
    private readonly elasticsearchService: ElasticsearchService,
    @InjectQueue('elasticsearch') private esQueue: Queue,
    @Inject(forwardRef(() => DeviceService))
    private readonly deviceService: DeviceService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    @Inject(forwardRef(() => SensorService))
    private readonly sensorService: SensorService,
  ) {
    const dateReviver = (_: any, value: string) => {
      const isISO8601Z =
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/;
      if (typeof value === 'string' && isISO8601Z.test(value)) {
        const tempDateNumber = Date.parse(value);
        if (!Number.isNaN(tempDateNumber)) {
          return new Date(tempDateNumber);
        }
      }
      return value;
    };

    const options = {
      retryStrategy: (times: number) => {
        // reconnect after
        return Math.min(times * 50, 2000);
      },
    };

    this.pubSub = new RedisPubSub({
      publisher: new Redis(
        this.configService.get<string>('REDIS_URI'),
        options,
      ),
      subscriber: new Redis(
        this.configService.get<string>('REDIS_URI'),
        options,
      ),
      reviver: dateReviver,
    });
  }

  private readonly logger = new Logger(ElasticsearchSensorService.name);

  async onModuleInit() {
    // refresh the data for the collection 'elasticsearch_sensors' and start syncing
    await this.refreshElasticSearch();
  }

  async elasticSearchSetting(): Promise<ElasticSearchSensor[]> {
    // get all sensors from the database
    const rootGroup = await this.groupService.getRootGroup();
    const sensors = await this.deviceService.getSensorsUnderGroup(
      rootGroup?.id,
    );

    // write the sync information from sensors to elasticSearchSensors (update or create it)
    const esSensors: ElasticSearchSensor[] = [];
    await Promise.all(
      sensors.flatMap(async (sensor) => {
        let esSensor = await this.esSensorModel.findOneAndUpdate(
          {
            deviceType: sensor.deviceType,
            sensorId: sensor.sensorId,
          },
          {
            sensorName: sensor.name,
            sensorType: sensor.type,
          },
        );

        if (esSensor === null) {
          const s = new ElasticSearchSensor();
          s.deviceType = sensor.deviceType;
          s.sensorId = sensor.sensorId;
          s.sensorName = sensor.name;
          s.sensorType = sensor.type;
          s.status = 100;
          s.enable = false;
          esSensor = await this.esSensorModel.create(s);
          this.logger.log(
            `Create the new elasticSearchSensor in db: ${JSON.stringify(
              esSensor,
            )}`,
          );
        }

        esSensors.push(esSensor);
      }),
    );

    // it connot get the timestamp from elasticsearch when writing data to elasticsearch
    const active = await this.esQueue.getActiveCount();
    if (active === 0) {
      // check the 'from' and 'to' info from the elasticsearch
      await Promise.all(
        esSensors.flatMap(async (s) => {
          await this.applyTimestamp(
            this.getIndexName(s.deviceType, s.sensorId),
            s,
          );
          await this.esSensorModel.findOneAndUpdate(
            {
              deviceType: s.deviceType,
              sensorId: s.sensorId,
            },
            {
              from: s.from,
              to: s.to,
            },
          );
        }),
      );
    }

    return esSensors;
  }

  async addToElasticSearch(
    elasticSearchInput: ElasticSearchInput,
  ): Promise<ElasticSearchSensor> {
    // throw the error if this sensor is still processing
    const esSensor = await this.esSensorModel.findOne({
      deviceType: elasticSearchInput.deviceType,
      sensorId: elasticSearchInput.sensorId,
    });

    if (!esSensor) {
      throw new ApolloError(
        `Please check deviceType or sensorId you provided.`,
        ErrorCode.SENSOR_NOT_FOUND,
      );
    }

    const activeJob = await this.getActiveJob(
      esSensor.deviceType,
      esSensor.sensorId,
    );
    if (activeJob !== undefined) {
      throw new ApolloError(
        `You cannot add sensor history of this sensor now due to it is processing. Please try again later.`,
        ErrorCode.ELASTIC_SEARCH_STILL_PROCESSING,
      );
    }

    // check the 'from' and 'to' info from the elasticsearch
    await this.applyTimestamp(
      this.getIndexName(esSensor.deviceType, esSensor.sensorId),
      esSensor,
    );

    // determine the elasticSearchInput.to by the oldest record in the elasticsearch
    if (!elasticSearchInput.to) {
      // compare the elasticSearchInput.from and esSensor.from
      if (elasticSearchInput.from?.getTime() >= esSensor.from?.getTime()) {
        throw new ApolloError(
          `You cannot set the start date after the date of the oldest record in the elasticsearch, because they already exist.`,
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      }

      elasticSearchInput.to = esSensor.from || new Date();
      this.logger.log(
        `The elasticSearchInput.to is missing, and set it to ${elasticSearchInput.to.getTime()} automatically.`,
      );
    }

    // add processing to the background task
    const job = await this.esQueue.add(
      Constants.BULL_TASK_SYNC_ELASTICSEARCH,
      elasticSearchInput,
    );
    this.processControl.set(job.id, true);

    return esSensor;
  }

  async deleteIndexFromElasticSearch(
    deviceType: DeviceType,
    sensorId: string,
  ): Promise<ElasticSearchSensor> {
    // disable the sync to elasticsearch
    const esSensor = await this.esSensorModel.findOneAndUpdate(
      {
        deviceType,
        sensorId,
      },
      {
        enable: false,
        status: 100,
        from: null,
        to: null,
      },
      {
        new: true,
      },
    );

    if (!esSensor) {
      throw new ApolloError(
        `Please check deviceType or sensorId you provided.`,
        ErrorCode.SENSOR_NOT_FOUND,
      );
    }

    // find the active job and set the enable flag to false
    const job = await this.getActiveJob(deviceType, sensorId);
    if (job) {
      this.processControl.set(job.id, false);
    }

    // re-subscribe the MQTT from the CHT IOT
    await this.refreshElasticSearch();

    // delete the index on the elasticsearch
    if (this.isCameraSensor(esSensor.sensorId)) {
      try {
        await this.elasticsearchService.updateByQuery({
          index: this.getIndexName(esSensor.deviceType, esSensor.sensorId),
          body: {
            query: {
              exists: { field: esSensor.sensorId },
            },
            script: `ctx._source.remove(\'${esSensor.sensorId}\')`,
          },
          refresh: true,
        });

        // delete the data if all fileds are gone
        const allFields = this.sensorIdsForIVSEvents.map((it) => {
          return {
            exists: {
              field: it,
            },
          };
        });
        await this.elasticsearchService.deleteByQuery({
          index: this.getIndexName(esSensor.deviceType, esSensor.sensorId),
          body: {
            query: {
              bool: {
                must_not: allFields,
              },
            },
          },
        });
      } catch (error) {
        this.logger.error(error);
      }
    } else {
      try {
        await this.elasticsearchService.indices.delete({
          index: this.getIndexName(esSensor.deviceType, esSensor.sensorId),
        });
      } catch (error) {
        this.logger.error(error);
        throw new ApolloError(
          `The data in the elasticsearch is empty. Nothing to be deleted.`,
          ErrorCode.ELASTIC_SEARCH_INDEX_NOT_FOUND,
        );
      }
    }

    // check the 'from' and 'to' info from the elasticsearch
    await this.applyTimestamp(
      this.getIndexName(esSensor.deviceType, esSensor.sensorId),
      esSensor,
    );
    return esSensor;
  }

  async deleteFromElasticSearch(
    esSensor: ElasticSearchSensor,
    from: Date,
    to: Date,
  ): Promise<void> {
    const index = this.getIndexName(esSensor.deviceType, esSensor.sensorId);
    this.logger.log(
      `deleteFromElasticSearch: ${index} from ${from.toISOString()} to ${to.toISOString()}`,
    );
    try {
      await this.elasticsearchService.deleteByQuery({
        index,
        body: {
          query: {
            range: {
              time: {
                gte: StringUtils.dateToTimestampMilli(from),
                lt: StringUtils.dateToTimestampMilli(to),
              },
            },
          },
        },
      });
    } catch (error) {
      this.logger.warn(error);
    }
  }

  async enableElasticSearch(
    deviceType: DeviceType,
    sensorId: string,
    enable: boolean,
  ): Promise<ElasticSearchSensor> {
    // throw the error if this sensor is still processing
    const esSensorBefore = await this.esSensorModel.findOne({
      deviceType,
      sensorId,
    });

    if (!esSensorBefore) {
      throw new ApolloError(
        `Please check deviceType or sensorId you provided.`,
        ErrorCode.SENSOR_NOT_FOUND,
      );
    }

    const job = await this.getActiveJob(deviceType, sensorId);
    if (job !== undefined) {
      throw new ApolloError(
        `You cannot switch enable this sensor now due to it is processing. Please try again later.`,
        ErrorCode.ELASTIC_SEARCH_STILL_PROCESSING,
      );
    }

    // udpate the 'enable' for this elasticSearchSensor to the database
    const esSensor = await this.esSensorModel.findOneAndUpdate(
      {
        deviceType,
        sensorId,
      },
      {
        enable,
      },
      {
        new: true,
      },
    );

    // re-subscribe the MQTT from the CHT IOT
    await this.refreshElasticSearch();

    // if change from disable to enable, make up the missing records
    await this.applyTimestamp(
      this.getIndexName(esSensor.deviceType, esSensor.sensorId),
      esSensor,
    );

    if (enable && esSensor.to) {
      const elasticSearchInput = new ElasticSearchInput();
      elasticSearchInput.deviceType = deviceType;
      elasticSearchInput.sensorId = sensorId;
      elasticSearchInput.from = esSensor.to;
      elasticSearchInput.to = new Date();
      esSensor.status = 0;
      await this.addToElasticSearch(elasticSearchInput);
    } else {
      // notify the UI for the first enabled sensor because they don't process the batch history data
      setTimeout(() => {
        void (async () => {
          await this.onProgressChanged(
            esSensor,
            esSensor.from,
            esSensor.to,
            100,
          );
        })();
      }, 2000);
    }

    return esSensor;
  }

  async processElasticSearchChanged(deviceType: DeviceType, sensorId: string) {
    const elasticSearchInput = new ElasticSearchInput();
    elasticSearchInput.deviceType = deviceType;
    elasticSearchInput.sensorId = sensorId;
    await this.esQueue.add(
      Constants.BULL_TASK_INIT_ES_RESPONSE,
      elasticSearchInput,
    );

    return this.pubSub.asyncIterator(
      `${this.configService.get<string>('NODE_ENV')}/${
        Constants.PREFIX_FOR_ES_PROCESSING_TOPIC
      }${deviceType}/${sensorId}`,
    );
  }

  async onProgressChanged(
    esSensor: ElasticSearchSensor,
    from: Date,
    to: Date,
    progress: number,
  ) {
    esSensor.from = from;
    esSensor.to = to;
    esSensor.status = progress;

    await this.esSensorModel.findOneAndUpdate(
      {
        deviceType: esSensor.deviceType,
        sensorId: esSensor.sensorId,
      },
      {
        status: progress,
      },
    );

    if (progress === 100) {
      // check the 'from' and 'to' info from the elasticsearch
      await this.applyTimestamp(
        this.getIndexName(esSensor.deviceType, esSensor.sensorId),
        esSensor,
      );
    }

    void this.pubSub.publish(
      `${this.configService.get<string>('NODE_ENV')}/${
        Constants.PREFIX_FOR_ES_PROCESSING_TOPIC
      }${esSensor.deviceType}/${esSensor.sensorId}`,
      {
        processElasticSearchChanged: esSensor,
      },
    );
  }

  async createESIndexIfNotExist(indexName: string, properties: any) {
    try {
      await this.elasticsearchService.indices.get({
        index: indexName,
      });
      this.logger.log(`index "${indexName}" already created.`);
    } catch (error) {
      this.logger.warn(`index "${indexName}" is missing. creating...`);
      await this.elasticsearchService.indices
        .create({
          index: indexName,
          body: {
            settings: {
              index: {
                number_of_shards: this.configService.get<number>(
                  'ELASTICSEARCH_NUMBER_OF_SHARDS',
                ),
                number_of_replicas: this.configService.get<number>(
                  'ELASTICSEARCH_NUMBER_OF_REPLICAS',
                ),
              },
            },
            mappings: {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              properties,
            },
          },
        })
        .catch((e) => {
          this.logger.warn(e);
        });
      this.logger.log(`index "${indexName}" created.`);
    }
  }

  async createESIndexForSensor(esSensor: ElasticSearchSensor) {
    let valueMapping = {};
    switch (esSensor.sensorType) {
      case SensorType.TEXT: {
        valueMapping = {
          type: 'keyword',
        };
        break;
      }
      case SensorType.GAUGE: {
        valueMapping = {
          type: 'float',
        };
        break;
      }
      case SensorType.SNAPSHOT: {
        valueMapping = {
          type: 'text',
        };
        break;
      }
      case SensorType.SWITCH: {
        valueMapping = {
          type: 'boolean',
        };
        break;
      }
    }
    // create the index first if not existed
    if (this.isCameraSensor(esSensor.sensorId)) {
      await this.createESIndexIfNotExist(
        this.getIndexName(esSensor.deviceType, esSensor.sensorId),
        {
          time: {
            type: 'date',
            format: 'epoch_millis',
          },
          deviceId: {
            type: 'keyword',
          },
          type: {
            type: 'keyword',
          },
          clothesColor: {
            type: 'keyword',
          },
          gender: {
            type: 'keyword',
          },
          numberPlate: {
            type: 'keyword',
          },
          vehicleType: {
            type: 'keyword',
          },
          vehicleColor: {
            type: 'keyword',
          },
          human_flow_sex: {
            type: 'keyword',
          },
        },
      );
    } else {
      await this.createESIndexIfNotExist(
        this.getIndexName(esSensor.deviceType, esSensor.sensorId),
        {
          time: {
            type: 'date',
            format: 'epoch_millis',
          },
          deviceId: {
            type: 'keyword',
          },
          value: valueMapping,
        },
      );
    }
  }

  async saveSensorValueToElasticsearch(
    deviceId: string,
    deviceType: DeviceType,
    sensorId: string,
    data: ISensorData,
  ) {
    const timestampInMilli = StringUtils.dateToTimestampMilli(data.time);

    await this.elasticsearchService.index({
      index: this.getIndexName(deviceType, sensorId),
      id: `${deviceId}.${sensorId}.${timestampInMilli}`,
      body: {
        deviceId: deviceId,
        time: timestampInMilli,
        value:
          (data as GaugeSensorData)?.value ||
          (data as SnapshotSensorData)?.value ||
          (data as TextSensorData)?.value ||
          (data as SwitchSensorData)?.value,
      },
    });
  }

  async saveCameraSensorsToElasticsearch(
    deviceId: string,
    deviceType: DeviceType,
    recognitionType: RecognitionType,
    sensorId: string,
    data: ISensorData,
  ) {
    if (!recognitionType) return;

    const timestampInMilli = StringUtils.dateToTimestampMilli(data.time);
    let map = {};
    switch (sensorId) {
      // human_shape
      case Constants.ID_CAMERA_PEDESTRIAN: {
        map = {
          pedestrian: (data as SnapshotSensorData).value,
        };
        break;
      }
      case Constants.ID_CAMERA_CLOTHESCOLOR: {
        map = {
          clothesColor: (data as TextSensorData).value,
        };
        break;
      }
      case Constants.ID_CAMERA_GENDER: {
        map = {
          gender: (data as TextSensorData).value,
        };
        break;
      }
      // car_identify
      case Constants.ID_CAMERA_VEHICLE: {
        map = {
          vehicle: (data as SnapshotSensorData).value,
        };
        break;
      }
      case Constants.ID_CAMERA_NUMBERPLATE: {
        map = {
          numberPlate: (data as TextSensorData).value,
        };
        break;
      }
      case Constants.ID_CAMERA_VEHICLETYPE: {
        map = {
          vehicleType: (data as TextSensorData).value,
        };
        break;
      }
      case Constants.ID_CAMERA_VEHICLECOLOR: {
        map = {
          vehicleColor: (data as TextSensorData).value,
        };
        break;
      }
      // human_flow_advance
      case Constants.ID_CAMERA_HUMAN_FLOW_SEX: {
        map = {
          human_flow_sex: (data as TextSensorData).value,
        };
        break;
      }
      case Constants.ID_CAMERA_HUMAN_FLOW_AGE: {
        map = {
          human_flow_age: (data as GaugeSensorData).value,
        };
        break;
      }
      case Constants.ID_CAMERA_HUMAN_FLOW_IMAGE: {
        map = {
          human_flow_image: (data as SnapshotSensorData).value,
        };
        break;
      }
      // car_flow
      case Constants.ID_CAMERA_CAR_FLOW_STRAIGHT_COUNT: {
        map = {
          car_flow_straight_count: (data as SnapshotSensorData).value,
        };
        break;
      }
      case Constants.ID_CAMERA_CAR_FLOW_STRAIGHT_IMAGE: {
        map = {
          car_flow_straight_image: (data as SnapshotSensorData).value,
        };
        break;
      }
      // human_flow
      case Constants.ID_CAMERA_HUMAN_COUNT: {
        map = {
          human_count: (data as GaugeSensorData).value,
        };
        break;
      }
      case Constants.ID_CAMERA_HUMAN_IMAGE: {
        map = {
          human_image: (data as SnapshotSensorData).value,
        };
        break;
      }
    }

    await this.elasticsearchService.update({
      index: this.getIndexName(deviceType, sensorId),
      id: `${deviceId}.${recognitionType.toLowerCase()}.${timestampInMilli}`,
      body: {
        doc: {
          deviceId: deviceId,
          time: timestampInMilli,
          type: recognitionType.toLowerCase(),
          ...map,
        },
        doc_as_upsert: true,
      },
      refresh: true,
      retry_on_conflict: 10,
    });
  }

  private async refreshElasticSearch(): Promise<ElasticSearchSensor[]> {
    // get all elasticsearch sensors from the database
    const esSensors = await this.elasticSearchSetting();

    // re-subscribe the sensors from the CHT IOT
    await this.reSyncSensors(esSensors);

    return esSensors;
  }

  // sync the sensor values from the CHT IOT to elasticsearch
  private async reSyncSensors(esSensors: ElasticSearchSensor[]) {
    // clear all previous MQTT subscription from the CHT IOT
    this.mqttClients.forEach((client, projectKey) =>
      client.end(true, null, (error) => {
        this.logger.log(
          `[reSyncSensors] Close the client for ${projectKey}, error = ${error?.message}`,
        );
      }),
    );
    this.mqttClients.clear();

    // get all project level group and its deviceIds
    const pGroups = await this.groupService.gorupsForProjectLevel();

    // subscribe to different IOT projects
    for (const pGroup of pGroups) {
      this.logger.log(
        `[reSyncSensors] Subscribe to sensor values under ${pGroup.name}`,
      );

      const mqttTopics = (
        await Promise.all(
          esSensors
            .filter((it) => it.enable)
            .map(async (esSensor) => {
              // make sure the index existed in the elasticsearch
              await this.createESIndexForSensor(esSensor);

              const devices = await this.deviceService.getDevicesUnderGroup(
                pGroup.id,
                esSensor.deviceType,
                esSensor.sensorId,
              );
              return devices.map((d) => {
                const sensor = d.getSensor(esSensor.sensorId);
                return `/v1/device/${d.deviceId}/sensor/${sensor.iotSensorId}/rawdata`;
              });
            }),
        )
      ).reduce((acc, curVal) => {
        return acc.concat(curVal);
      }, []);

      this.logger.log(
        `[reSyncSensors] Prepare topics for ${pGroup.name} successfully`,
      );

      const option: MqttOption = {
        username: pGroup.projectKey,
        password: pGroup.projectKey,
        mqttTopics,
      };

      const client = connect(
        this.configService.get<string>('CHTIOT_MQTT_URI'),
        option,
      );

      this.logger.log(`Subscribe to MQTT for ${pGroup.name}`);
      MQTTHelper.subscribeMultipleTopics(client, option.mqttTopics);

      client.on('error', (error?: Error) => {
        this.logger.error(`[reSyncSensors] MQTT client on error`, error?.stack);
      });

      client.on('close', (error?: Error) => {
        this.logger.log(
          `[reSyncSensors] MQTT client on close with error = ${error?.stack}`,
        );
      });

      client.on('message', (_mqttTopic, message) => {
        void (async () => {
          const mqttResponse = JSON.parse(
            message.toString(),
          ) as MqttSensorResponse;

          const device = await this.deviceService.getDeviceById(
            mqttResponse.deviceId,
          );

          const sensor = device.sensors.find(
            (it) => it.iotSensorId === mqttResponse.id,
          );

          const response = this.sensorService.parseMqttSensorResponse(
            sensor.type,
            mqttResponse,
            sensor.sensorId,
          );

          // write the data to ElasticSearch
          if (this.isCameraSensor(sensor.sensorId)) {
            await this.saveCameraSensorsToElasticsearch(
              response.deviceId,
              device.type,
              device.recognitionType(),
              sensor.sensorId,
              response.data,
            );
          } else {
            await this.saveSensorValueToElasticsearch(
              response.deviceId,
              device.type,
              sensor.sensorId,
              response.data,
            );
          }
        })();
      });

      this.mqttClients.set(pGroup.projectKey, client);
    }
  }

  subscribeNewDevice(projectKey: string, device: Device) {
    device.sensors.forEach((sensor) => {
      void (async () => {
        const esSensor = await this.esSensorModel.findOne({
          deviceType: device.type,
          sensorId: sensor.sensorId,
        });
        if (esSensor?.enable) {
          const topic = `/v1/device/${device.deviceId}/sensor/${sensor.iotSensorId}/rawdata`;
          const client = this.mqttClients.get(projectKey);
          if (client) {
            this.logger.log(`subscribeNewDevice topic: ${topic}`);
            client.subscribe(topic, { qos: 0 }, (error, _qos) => {
              if (error) {
                this.logger.error(`[MQTT][ERROR]: ${error.message}`);
              }
            });
          }
        }
      })();
    });
  }

  getIndexName(deviceType: DeviceType, sensorId: string): string {
    if (this.isCameraSensor(sensorId)) {
      return `${this.configService.get<string>('NODE_ENV')}.${deviceType}.${
        Constants.INDEX_SUFFIX_FOR_CAMERA_EVENTS
      }`.toLowerCase();
    }

    return `${this.configService.get<string>(
      'NODE_ENV',
    )}.${deviceType}.${sensorId}`.toLowerCase();
  }

  private async applyTimestamp(
    indexName: string,
    esSensor: ElasticSearchSensor,
  ) {
    let existedField = {};

    // check the field '${sensorId}' for camera sensors and 'value' for commmon sensors
    if (this.isCameraSensor(esSensor.sensorId)) {
      existedField = {
        exists: {
          field: esSensor.sensorId,
        },
      };
    } else {
      existedField = {
        exists: {
          field: 'value',
        },
      };
    }

    try {
      const latest = await this.elasticsearchService.search<
        SearchResponse<ESDeviceStatus>
      >({
        index: indexName,
        body: {
          query: {
            bool: {
              must: [existedField],
            },
          },
          size: 1,
          sort: [
            {
              time: {
                order: 'desc',
              },
            },
          ],
        },
      });
      esSensor.to = new Date(latest.body.hits.hits[0]._source.time);
    } catch {
      esSensor.to = null;
      this.logger.log(
        `Apply latest timestamp to ${esSensor.deviceType}-${esSensor.sensorId}, but there is no document found in the elasticsearch.`,
      );
    }

    try {
      const oldest = await this.elasticsearchService.search<
        SearchResponse<ESDeviceStatus>
      >({
        index: indexName,
        body: {
          query: {
            bool: {
              must: [existedField],
            },
          },
          size: 1,
          sort: [
            {
              time: {
                order: 'asc',
              },
            },
          ],
        },
      });
      esSensor.from = new Date(oldest.body.hits.hits[0]._source.time);
    } catch {
      esSensor.from = null;
      this.logger.log(
        `Apply oldest timestamp to ${esSensor.deviceType}-${esSensor.sensorId}, but there is no document found in the elasticsearch.`,
      );
    }
  }

  isCameraSensor(sensorId: string) {
    return this.sensorIdsForIVSEvents.includes(sensorId);
  }

  private async getActiveJob(
    deviceType: DeviceType,
    sensorId: string,
  ): Promise<Bull.Job<ElasticSearchInput>> {
    const jobs = await this.esQueue.getActive();
    const activeJob = jobs.find((job) => {
      if (job.name === Constants.BULL_TASK_SYNC_ELASTICSEARCH) {
        const input = job.data as ElasticSearchInput;
        return input.deviceType === deviceType && input.sensorId === sensorId;
      }
      return false;
    });

    return activeJob;
  }
}
