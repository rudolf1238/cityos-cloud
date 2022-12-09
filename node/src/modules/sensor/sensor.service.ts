import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Sensor, SensorDocument } from 'src/models/sensor';
import {
  EditSensorInput,
  SensorResponse,
  SensorType,
  GaugeSensorData,
  SnapshotSensorData,
  TextSensorData,
  SwitchSensorData,
  DeviceStatusResponse,
  ISensorData,
  ExtremeOperation,
  DeviceType,
  ProperRateResponse,
  DeviceStatus,
  StatsOption,
  ExtremeValueChangedResponse,
  GenderAndAgeData,
  GenderHistory,
  AgeHistogram,
  GenderPercent,
  MetricAggregationResponse,
  MultiISensorData,
} from 'src/graphql.schema';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';
import { connect, MqttClient } from 'mqtt';
import { ConfigService } from '@nestjs/config';
import { ApolloError } from 'apollo-server-express';
import { ErrorCode } from 'src/models/error.code';
import { Attribute, Device } from 'src/models/device';
import StringUtils from 'src/utils/StringUtils';
import { DeviceService } from '../device/device.service';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { Constants } from 'src/constants';
import { GroupService } from '../group/group.service';
import { Cron } from '@nestjs/schedule';
import { SearchResponse } from '@elastic/elasticsearch/api/types';
import {
  ESDeviceStatus,
  ESLatestAggregations,
} from 'src/es.models/es.device.status';
import { ElasticSearchSensor } from 'src/models/elasticsearch.sensor';
import { DateTime } from 'luxon';
import { ESSensorStatsAggregations } from 'src/es.models/es.sensor.stats';
import { ElasticsearchSensorService } from '../elasticsearch-sensor/elasticsearch-sensor.service';
import { ChangeStream } from 'mongodb';
import { ESSensorSumAggregations } from 'src/es.models/es.sensor.sum';
import { Document, Model } from 'mongoose';
import { ESGenderAge } from 'src/es.models/es.gender.age';
import { ESSensorRaw } from 'src/es.models/es.sensor.raw';
import { InjectModel } from '@nestjs/mongoose';
import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosResponse } from 'axios';

export interface MqttOption {
  username: string;
  password: string;
  mqttTopics: string[];
}

export interface MqttSetting {
  // option to cunstruct the MQTT client
  options: MqttOption[];
  // mapping for projectKey and devices
  data: Map<string, Device[]>;
  // total number of devices
  total: number;
}

export interface MqttSensorResponse {
  id: string;
  deviceId: string;
  time: string;
  value: string;
}

interface MqttStatusResponse {
  deviceId: string;
  createTime: string;
  status: string;
}

enum MqttTopicType {
  SENSOR,
  STATUS,
}

const withCancel = (
  asyncIterator: AsyncIterator<unknown>,
  onCancel: () => void,
) => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const asyncReturn = asyncIterator.return;

  // eslint-disable-next-line no-param-reassign
  asyncIterator.return = () => {
    onCancel();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return asyncReturn
      ? asyncReturn.call(asyncIterator)
      : Promise.resolve({ value: undefined, done: true });
  };

  return asyncIterator;
};

@Injectable()
export class SensorService implements OnModuleInit {
  private pubSub: RedisPubSub;

  private deepflowUrl: string;

  constructor(
    @InjectModel(Sensor.name)
    private readonly sensorModel: Model<SensorDocument>,
    private readonly chtiotClientService: ChtiotClientService,
    private httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly elasticsearchService: ElasticsearchService,
    @Inject(forwardRef(() => DeviceService))
    private readonly deviceService: DeviceService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    @Inject(forwardRef(() => ElasticsearchSensorService))
    private readonly elasticsearchSensorService: ElasticsearchSensorService,
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
    this.deepflowUrl = this.configService.get<string>('DEEPFLOW_SERVER_HOST');
  }

  private readonly logger = new Logger(SensorService.name);

  private deviceStatusIndexName = `${this.configService.get<string>(
    'NODE_ENV',
  )}.${Constants.INDEX_FOR_DEVICE_STATUS}`;

  private hourlyStatusIndexName = `${this.configService.get<string>(
    'NODE_ENV',
  )}.${Constants.INDEX_FOR_HOURLY_DEVICE_STATUS}`;

  async onModuleInit() {
    // create the index to store the status changed from the CHT IOT
    await this.elasticsearchSensorService.createESIndexIfNotExist(
      this.deviceStatusIndexName,
      {
        time: {
          type: 'date',
          format: 'epoch_millis',
        },
        deviceId: {
          type: 'keyword',
        },
      },
    );

    await this.serverListenerForDeviceStatus();

    // create the index to store the hourly device status
    await this.elasticsearchSensorService.createESIndexIfNotExist(
      this.hourlyStatusIndexName,
      {
        time: {
          type: 'date',
          format: 'epoch_millis',
        },
        deviceId: {
          type: 'keyword',
        },
      },
    );
  }

  @Cron(`0 0-23/${Constants.HOURS_TO_CHECK_DEVICE_STATUS} * * *`, {
    timeZone: 'Asia/Taipei',
  })
  async handleUpdateStatusCron() {
    const now = new Date();
    // ignore the milliseconds to prevent from the duplicated data when multiple instances
    now.setMilliseconds(0);
    this.logger.debug(
      `Start to check the device status at ${now.toTimeString()}`,
    );
    const timestampInMilli = StringUtils.dateToTimestampMilli(now);
    await this.updateDeviceStatusToES(timestampInMilli);
  }

  async create(sensors: Sensor[]): Promise<Sensor[]> {
    return Promise.all(
      sensors.flatMap(async (it) => {
        return this.sensorModel.create(it);
      }),
    );
  }

  async delete(sensors: Sensor[]): Promise<Sensor[]> {
    return Promise.all(
      sensors.map(async (it) => {
        return this.sensorModel.findByIdAndDelete(it._id);
      }),
    );
  }

  async updateSensor(
    projectKey: string,
    deviceId: string,
    sensorId: string,
    value: any,
  ): Promise<boolean> {
    const sensor = await this.getSensorById(deviceId, sensorId);
    const sensorType = sensor?.type;
    let inputType: SensorType;
    switch (typeof value) {
      case 'boolean': {
        inputType = SensorType.SWITCH;
        break;
      }
      case 'number': {
        inputType = SensorType.GAUGE;
        break;
      }
      case 'string': {
        inputType = SensorType.TEXT;
        break;
      }
      default: {
        throw new ApolloError(
          `Type for this value not supported.`,
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      }
    }
    if (sensorType !== inputType) {
      throw new ApolloError(
        `The sensorType for this sensor should be ${sensorType}, and please check your input value again.`,
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }
    await this.chtiotClientService.updateSensor(
      projectKey,
      deviceId,
      sensor.iotSensorId,
      value,
    );
    return true;
  }

  async editSensor(
    projectKey: string,
    deviceId: string,
    sensorId: string,
    editSensorInput: EditSensorInput,
  ): Promise<boolean> {
    const sensor = await this.getSensorById(deviceId, sensorId);
    if (sensor === null) {
      throw new ApolloError(
        `Cannot find the sensor - ${deviceId}(${sensorId}) in the database.`,
        ErrorCode.SENSOR_NOT_FOUND,
      );
    }

    // update the sensor info in the CityOS
    // sensor name cannot be blank and max length is 255
    if (!this.isValidEditSensorInput(editSensorInput)) {
      throw new ApolloError(
        'Please check the length of your inputs.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }
    if (editSensorInput.name) sensor.name = editSensorInput.name;
    if (editSensorInput.desc) sensor.desc = editSensorInput.desc;
    if (editSensorInput.type) sensor.type = editSensorInput.type;
    if (editSensorInput.unit) sensor.unit = editSensorInput.unit;
    if (editSensorInput.attributes) {
      sensor.attributes = editSensorInput.attributes.flatMap((it) => {
        const attribute = new Attribute();
        attribute.key = it.key;
        attribute.value = it.value;
        return attribute;
      });
    }

    // update device info in the CHT IOT platform
    await this.chtiotClientService.editSensor(projectKey, deviceId, sensor);

    return !!(await this.sensorModel.updateOne({ _id: sensor._id }, sensor));
  }

  async listenSensorValueChanged(
    deviceId: string,
    sensorId: string,
  ): Promise<AsyncIterator<unknown>> {
    const projectKey = await this.deviceService.getProjectKeyById(deviceId);
    if (projectKey === null) {
      throw new ApolloError(
        `Cannot find the projectKey for ${deviceId} in the database.`,
        ErrorCode.DEVICE_NOT_FOUND,
      );
    }

    const sensor = await this.getSensorById(deviceId, sensorId);
    const topic = `/v1/device/${deviceId}/sensor/${sensor.iotSensorId}/rawdata`;
    if (sensor === null) {
      throw new ApolloError(
        `Cannot find the sensor - ${deviceId}(${sensorId}) in the database.`,
        ErrorCode.SENSOR_NOT_FOUND,
      );
    }

    const option: MqttOption = {
      username: projectKey,
      password: projectKey,
      mqttTopics: [topic],
    };

    return this.subscribeToMqtt(topic, [option], (_mqttTopic, message) => {
      const data = JSON.parse(message.toString()) as MqttSensorResponse;
      void this.pubSub.publish(topic, {
        sensorValueChanged: this.parseMqttSensorResponse(
          sensor.type,
          data,
          sensor.sensorId,
        ),
      });
    });
  }

  async listenDevicesStatusChanged(
    redisTopic: string,
    deviceIds: string[],
  ): Promise<AsyncIterator<unknown>> {
    const inputs = new Map<string, string[]>();
    await Promise.all(
      deviceIds.flatMap(async (it) => {
        const projectKey = await this.deviceService.getProjectKeyById(it);
        if (projectKey != null) {
          if (inputs.get(projectKey) === undefined) {
            inputs.set(projectKey, [it]);
          } else {
            inputs.get(projectKey).push(it);
          }
        }
      }),
    );

    const options: MqttOption[] = [];
    inputs.forEach((values, projectKey) => {
      const option: MqttOption = {
        username: projectKey,
        password: projectKey,
        mqttTopics: values.map((deviceId) => `/v1/device/${deviceId}/active`),
      };
      options.push(option);
    });

    return this.subscribeToMqtt(redisTopic, options, (_mqttTopic, message) => {
      const data = JSON.parse(message.toString()) as MqttStatusResponse;
      this.logger.debug(
        `[MQTT][listenDevicesStatusChanged]: ${JSON.stringify(data)}`,
      );

      const deviceStatusResponse = new DeviceStatusResponse();
      deviceStatusResponse.deviceId = data.deviceId;

      // XXX: force to set the status of device to active
      deviceStatusResponse.status = (() => {
        if (
          this.configService.get<string>('DEVICE_FORCE_ACTIVE', '0') === '1'
        ) {
          const ignoreDeviceList = JSON.parse(
            this.configService.get<string>('IGNORE_DEVICE_FORCE_ACTIVE', '[]'),
          ) as string[];
          if (ignoreDeviceList.includes(data.deviceId)) {
            return StringUtils.deviceStatusFrom(data.status);
          }
          return DeviceStatus.ACTIVE;
        }
        return StringUtils.deviceStatusFrom(data.status);
      })();

      deviceStatusResponse.time = new Date(data.createTime);

      void this.pubSub.publish(redisTopic, {
        devicesStatusChanged: deviceStatusResponse,
      });
    });
  }

  async sensorValueAtTime(
    device: Device,
    sensorId: string,
    time: Date,
  ): Promise<ISensorData> {
    const projectKey = device.groups[0].projectKey;
    const sensor = device.getSensor(sensorId);
    const sensorType = sensor.type;

    const history: ISensorData[] = [];
    let response: ISensorData[] = [];
    let from = DateTime.fromJSDate(time).minus({ hour: 24 }).toJSDate();

    do {
      response = await this.chtiotClientService.sensorValuesRawHistory(
        projectKey,
        device.deviceId,
        sensor.iotSensorId,
        sensorType,
        from,
        time,
      );
      history.push(...response);

      if (response.length > 0) {
        from = response[response.length - 1].time;
      }
    } while (response.length > 1);

    if (history.length > 0) {
      return history[history.length - 1];
    } else {
      return null;
    }
  }

  async gadgetForGenderAndAge(
    device: Device,
    start: Date,
    end: Date,
    interval: number,
  ): Promise<GenderAndAgeData> {
    // initialize
    const response = new GenderAndAgeData();
    response.deviceId = device.deviceId;
    response.deviceName = device.name;

    const history = new GenderHistory();
    history.female = [];
    history.male = [];
    response.history = history;

    // history for female
    const historyFemale = await this.elasticsearchService
      .search<SearchResponse<any>>({
        index: this.elasticsearchSensorService.getIndexName(
          device.type,
          Constants.ID_CAMERA_HUMAN_FLOW_SEX,
        ),
        body: {
          size: 0,
          query: {
            bool: {
              filter: [
                {
                  term: {
                    type: Constants.VALUE_ATTR_HUMAN_FLOW_ADVANCE,
                  },
                },
                {
                  term: {
                    deviceId: device.deviceId,
                  },
                },
                {
                  term: {
                    human_flow_sex: 'f',
                  },
                },
                {
                  range: {
                    time: {
                      gte: StringUtils.dateToTimestampMilli(start),
                      lt: StringUtils.dateToTimestampMilli(end),
                    },
                  },
                },
              ],
            },
          },
          aggs: {
            latest: {
              date_histogram: {
                field: 'time',
                fixed_interval: `${interval}m`,
                time_zone: 'Asia/Taipei',
              },
            },
          },
        },
      })
      .catch((_error) => {
        this.logger.error(_error);
        throw new ApolloError(
          `Cannot find the index created in the elasticsearch. Please sync the data from CHT IOT first.`,
          ErrorCode.ELASTIC_SEARCH_INDEX_NOT_FOUND,
        );
      });

    (
      historyFemale.body.aggregations as unknown as ESSensorStatsAggregations
    ).latest.buckets.forEach((bucket) => {
      const data = new GaugeSensorData();
      data.type = SensorType.GAUGE;
      data.time = new Date(bucket.key);
      data.value = bucket.doc_count;

      history.female.push(data);
    });

    // history for male
    const historyMale = await this.elasticsearchService
      .search<SearchResponse<any>>({
        index: this.elasticsearchSensorService.getIndexName(
          device.type,
          Constants.ID_CAMERA_HUMAN_FLOW_SEX,
        ),
        body: {
          size: 0,
          query: {
            bool: {
              filter: [
                {
                  term: {
                    type: Constants.VALUE_ATTR_HUMAN_FLOW_ADVANCE,
                  },
                },
                {
                  term: {
                    deviceId: device.deviceId,
                  },
                },
                {
                  term: {
                    human_flow_sex: 'm',
                  },
                },
                {
                  range: {
                    time: {
                      gte: StringUtils.dateToTimestampMilli(start),
                      lt: StringUtils.dateToTimestampMilli(end),
                    },
                  },
                },
              ],
            },
          },
          aggs: {
            latest: {
              date_histogram: {
                field: 'time',
                fixed_interval: `${interval}m`,
                time_zone: 'Asia/Taipei',
              },
            },
          },
        },
      })
      .catch((_error) => {
        this.logger.error(_error);
        throw new ApolloError(
          `Cannot find the index created in the elasticsearch. Please sync the data from CHT IOT first.`,
          ErrorCode.ELASTIC_SEARCH_INDEX_NOT_FOUND,
        );
      });

    (
      historyMale.body.aggregations as unknown as ESSensorStatsAggregations
    ).latest.buckets.forEach((bucket) => {
      const data = new GaugeSensorData();
      data.type = SensorType.GAUGE;
      data.time = new Date(bucket.key);
      data.value = bucket.doc_count;

      history.male.push(data);
    });

    // histogram and percent for gender
    const ageHistogram = new AgeHistogram();
    ageHistogram.female = [0, 0, 0, 0];
    ageHistogram.male = [0, 0, 0, 0];
    response.histogram = ageHistogram;

    let numberOfFemale = 0;
    let numberOfMale = 0;

    const histogram = await this.elasticsearchService
      .search<SearchResponse<any>>({
        index: this.elasticsearchSensorService.getIndexName(
          device.type,
          Constants.ID_CAMERA_HUMAN_FLOW_AGE,
        ),
        body: {
          size: 0,
          query: {
            bool: {
              filter: [
                {
                  term: {
                    type: Constants.VALUE_ATTR_HUMAN_FLOW_ADVANCE,
                  },
                },
                {
                  term: {
                    deviceId: device.deviceId,
                  },
                },
                {
                  range: {
                    time: {
                      gte: StringUtils.dateToTimestampMilli(start),
                      lt: StringUtils.dateToTimestampMilli(end),
                    },
                  },
                },
              ],
            },
          },
          aggs: {
            gender: {
              terms: {
                field: Constants.ID_CAMERA_HUMAN_FLOW_SEX,
              },
              aggs: {
                age: {
                  terms: {
                    field: Constants.ID_CAMERA_HUMAN_FLOW_AGE,
                  },
                },
              },
            },
          },
        },
      })
      .catch((_error) => {
        this.logger.error(_error);
        throw new ApolloError(
          `Cannot find the index created in the elasticsearch. Please sync the data from CHT IOT first.`,
          ErrorCode.ELASTIC_SEARCH_INDEX_NOT_FOUND,
        );
      });

    (
      histogram.body.aggregations as unknown as ESGenderAge
    ).gender.buckets.forEach((genderBucket) => {
      switch (genderBucket.key) {
        case 'f': {
          numberOfFemale = genderBucket.doc_count;
          genderBucket.age.buckets.forEach((ageBucket) => {
            switch (ageBucket.key) {
              case 0: {
                ageHistogram.female[0] = ageBucket.doc_count;
                break;
              }
              case 1: {
                ageHistogram.female[1] = ageBucket.doc_count;
                break;
              }
              case 2: {
                ageHistogram.female[2] = ageBucket.doc_count;
                break;
              }
              case 3: {
                ageHistogram.female[3] = ageBucket.doc_count;
                break;
              }
              default: {
                this.logger.warn(
                  `Cannot recognize key for ${ageBucket.key}(f) in ageBucket ESGenderAge`,
                );
              }
            }
          });
          break;
        }
        case 'm': {
          numberOfMale = genderBucket.doc_count;
          genderBucket.age.buckets.forEach((ageBucket) => {
            switch (ageBucket.key) {
              case 0: {
                ageHistogram.male[0] = ageBucket.doc_count;
                break;
              }
              case 1: {
                ageHistogram.male[1] = ageBucket.doc_count;
                break;
              }
              case 2: {
                ageHistogram.male[2] = ageBucket.doc_count;
                break;
              }
              case 3: {
                ageHistogram.male[3] = ageBucket.doc_count;
                break;
              }
              default: {
                this.logger.warn(
                  `Cannot recognize key for ${ageBucket.key}(m) in ageBucket ESGenderAge`,
                );
              }
            }
          });
          break;
        }
        default: {
          this.logger.warn(
            `Cannot recognize key for ${genderBucket.key} in genderBucket ESGenderAge`,
          );
        }
      }
    });

    // percent for gender
    const percent = new GenderPercent();
    if (numberOfFemale + numberOfMale !== 0) {
      percent.percentForFemale = Math.round(
        (numberOfFemale / (numberOfFemale + numberOfMale)) * 100,
      );
      percent.percentForMale = 100 - percent.percentForFemale;
    } else {
      percent.percentForFemale = 0;
      percent.percentForMale = 0;
    }
    response.percent = percent;

    return response;
  }

  async getSensorById(deviceId: string, sensorId: string): Promise<Sensor> {
    const device = await this.deviceService.getDeviceById(deviceId);
    if (device === null) {
      throw new ApolloError(
        `Cannot find the device - ${deviceId} in the database.`,
        ErrorCode.DEVICE_NOT_FOUND,
      );
    }

    const filterSensors = device.sensors.filter(
      (it) => it.sensorId === sensorId,
    );
    return filterSensors.length > 0 ? filterSensors[0] : null;
  }

  async sensorValuesHistory(
    device: Device,
    sensorId: string,
    start: Date,
    end: Date,
    interval: number,
  ): Promise<ISensorData[]> {
    const response: GaugeSensorData[] = [];
    const result = await this.elasticsearchService
      .search<SearchResponse<any>>({
        index: this.elasticsearchSensorService.getIndexName(
          device.type,
          sensorId,
        ),
        body: {
          size: 0,
          query: {
            bool: {
              filter: [
                {
                  term: {
                    deviceId: device.deviceId,
                  },
                },
                {
                  range: {
                    time: {
                      gte: StringUtils.dateToTimestampMilli(start),
                      lt: StringUtils.dateToTimestampMilli(end),
                    },
                  },
                },
              ],
            },
          },
          aggs: {
            latest: {
              date_histogram: {
                field: 'time',
                fixed_interval: `${interval}m`,
                time_zone: 'Asia/Taipei',
              },
              aggs: {
                result: {
                  sum: {
                    field: this.elasticsearchSensorService.isCameraSensor(
                      sensorId,
                    )
                      ? sensorId
                      : 'value',
                  },
                },
              },
            },
          },
        },
      })
      .catch((_error) => {
        this.logger.error(_error);
        throw new ApolloError(
          `Cannot find the index created in the elasticsearch. Please sync the data from CHT IOT first.`,
          ErrorCode.ELASTIC_SEARCH_INDEX_NOT_FOUND,
        );
      });

    (
      result.body.aggregations as unknown as ESSensorSumAggregations
    ).latest.buckets.forEach((bucket) => {
      const data = new GaugeSensorData();
      data.type = SensorType.GAUGE;
      data.time = new Date(bucket.key);
      data.value = bucket.result.value;

      response.push(data);
    });

    return response;
  }

  async properRateHistory(
    groupId: string,
    start: Date,
    end: Date,
  ): Promise<ProperRateResponse[]> {
    // collect all devices under this group
    const devices = await this.deviceService.getDevicesUnderGroup(groupId);

    // using the deviceIds to get the proper rate history from the elasticsearch
    const result = await this.elasticsearchService.search<SearchResponse<any>>({
      index: this.hourlyStatusIndexName,
      body: {
        size: 0,
        query: {
          bool: {
            filter: [
              {
                term: {
                  status: DeviceStatus.ERROR.toLowerCase(),
                },
              },
              {
                terms: {
                  deviceId: devices.map((d) => d.deviceId),
                },
              },
              {
                range: {
                  time: {
                    gte: StringUtils.dateToTimestampMilli(start),
                    lt: StringUtils.dateToTimestampMilli(end),
                  },
                },
              },
            ],
          },
        },
        aggs: {
          latest: {
            date_histogram: {
              field: 'time',
              fixed_interval: `${Constants.HOURS_TO_CHECK_DEVICE_STATUS}h`,
              time_zone: 'Asia/Taipei',
            },
          },
        },
      },
    });

    const responses: ProperRateResponse[] = [];
    (
      result.body.aggregations as unknown as ESLatestAggregations<any>
    ).latest.buckets.forEach((bucket) => {
      const response = new ProperRateResponse();
      response.time = new Date(bucket.key);
      response.total = devices.length;
      response.errors = bucket.doc_count;

      // calculate the proper rate
      const properRateInPercentage =
        ((response.total - response.errors) / response.total) * 100;
      response.properRate = Math.round(properRateInPercentage);
      responses.push(response);
    });

    return responses;
  }

  async extremeValueChanged(
    redisTopic: string,
    groupId: string,
    deviceType: DeviceType,
    sensorId: string,
    statsOption: StatsOption,
  ): Promise<AsyncIterator<unknown>> {
    let setting = await this.mqttSettingFromGroup(
      groupId,
      MqttTopicType.SENSOR,
      deviceType,
      sensorId,
    );

    const extremeValueChangedResponse = new ExtremeValueChangedResponse();
    const extremeSensorResponse = new SensorResponse();
    extremeValueChangedResponse.total = setting.total;
    extremeValueChangedResponse.response = extremeSensorResponse;

    const history = new Map<string, ISensorData>();

    for (const [, devices] of setting.data) {
      for (const device of devices) {
        const type = device.sensors.find(
          (sensor) => sensor.sensorId === sensorId,
        )?.type;

        if (type !== SensorType.GAUGE) {
          if (
            type === SensorType.TEXT &&
            statsOption.operation === ExtremeOperation.COUNT &&
            statsOption.text
          ) {
          } else {
            throw new ApolloError(
              'Please check the existence of the sensor and the sensor type is GAUGE or the sensor type is TEXT with COUNT operation (text is required).',
              ErrorCode.SENSOR_TYPE_UNSUPPORTED,
            );
          }
        }
      }
    }

    return this.subscribeToMqtt(
      redisTopic,
      setting.options,
      (_mqttTopic, message) => {
        void (async () => {
          const response = JSON.parse(message.toString()) as MqttSensorResponse;
          this.logger.debug(
            `[MQTT][extremeValueChanged]: ${JSON.stringify(response)}`,
          );

          let hasChanged = false;
          switch (statsOption.operation) {
            case ExtremeOperation.MAX: {
              const res = this.parseMqttSensorResponse(
                SensorType.GAUGE,
                response,
                sensorId,
              );
              history.set(response.deviceId, res.data);
              const max = [
                ...(history as Map<string, GaugeSensorData>).entries(),
              ].reduce((a, e) => (e[1].value > a[1].value ? e : a));
              if (extremeSensorResponse.data?.time !== max[1].time) {
                extremeSensorResponse.deviceId = max[0];
                extremeSensorResponse.sensorId = sensorId;
                extremeSensorResponse.data = max[1];
                hasChanged = true;
              }
              break;
            }
            case ExtremeOperation.MIN: {
              const res = this.parseMqttSensorResponse(
                SensorType.GAUGE,
                response,
                sensorId,
              );
              history.set(response.deviceId, res.data);
              const min = [
                ...(history as Map<string, GaugeSensorData>).entries(),
              ].reduce((a, e) => (e[1].value < a[1].value ? e : a));
              if (extremeSensorResponse.data?.time !== min[1].time) {
                extremeSensorResponse.deviceId = min[0];
                extremeSensorResponse.sensorId = sensorId;
                extremeSensorResponse.data = min[1];
                hasChanged = true;
              }
              break;
            }
            case ExtremeOperation.COUNT: {
              const res = this.parseMqttSensorResponse(
                SensorType.TEXT,
                response,
                sensorId,
              );
              history.set(response.deviceId, res.data);
              const count = Array.from(
                history as Map<string, TextSensorData>,
                ([_deviceId, value]) => value,
              ).filter((it) => it.value === statsOption.text).length;
              const sensorData = new GaugeSensorData();
              sensorData.type = SensorType.GAUGE;
              sensorData.time = new Date(res.data.time);
              sensorData.value = count;

              extremeSensorResponse.deviceId = res.deviceId;
              extremeSensorResponse.sensorId = sensorId;
              extremeSensorResponse.data = sensorData;
              hasChanged = true;
              break;
            }
          }

          extremeValueChangedResponse.total = setting.total;

          if (hasChanged) {
            void this.pubSub.publish(redisTopic, {
              extremeValueChanged: extremeValueChangedResponse,
            });
          }
        })();
      },
      (clients, messageCallback) => {
        return this.deviceOnMongoChanged(() => {
          void (async () => {
            // unsubscribe all topics
            setting.options.forEach((option) => {
              const client = clients.get(option.username);
              option.mqttTopics.forEach((topic) => {
                client.unsubscribe(topic, { qos: 0 }, (error, _qos) => {
                  if (error) {
                    this.logger.error(`[MQTT][ERROR]: ${error.message}`);
                  }
                });
              });
            });

            setting = await this.mqttSettingFromGroup(
              groupId,
              MqttTopicType.SENSOR,
              deviceType,
              sensorId,
            );

            // remove the unused history
            let validIds: string[] = [];
            setting.data.forEach((devices, _) => {
              validIds = validIds.concat(devices.map((it) => it.deviceId));
            });
            history.forEach((_, deviceId) => {
              if (!validIds.includes(deviceId)) {
                history.delete(deviceId);
              }
            });

            // subscribe all topics
            setting.options.forEach((option) => {
              let client = clients.get(option.username);
              if (client === undefined) {
                client = connect(
                  this.configService.get<string>('CHTIOT_MQTT_URI'),
                  option,
                );

                client.on('connect', () => {
                  option.mqttTopics.forEach((topic) => {
                    client.subscribe(topic, { qos: 0 }, (error, _qos) => {
                      if (error) {
                        this.logger.error(`[MQTT][ERROR]: ${error.message}`);
                      }
                    });
                  });
                });

                client.on('message', messageCallback);

                clients.set(option.username, client);
              }
              option.mqttTopics.forEach((topic) => {
                client.subscribe(topic, { qos: 0 }, (error, _qos) => {
                  if (error) {
                    this.logger.error(`[MQTT][ERROR]: ${error.message}`);
                  }
                });
              });
            });
          })();
        });
      },
    );
  }

  async properRateChanged(
    redisTopic: string,
    groupId: string,
  ): Promise<AsyncIterator<unknown>> {
    let setting = await this.mqttSettingFromGroup(
      groupId,
      MqttTopicType.STATUS,
    );

    const properRateResponse = new ProperRateResponse();
    const history = new Map<string, DeviceStatus>();

    return this.subscribeToMqtt(
      redisTopic,
      setting.options,
      (_mqttTopic, message) => {
        const response = JSON.parse(message.toString()) as MqttStatusResponse;
        this.logger.debug(
          `[MQTT][properRateChanged]: ${JSON.stringify(response)}`,
        );

        // receive the status changed for any device
        const deviceStatusResponse = new DeviceStatusResponse();
        deviceStatusResponse.deviceId = response.deviceId;
        deviceStatusResponse.status = StringUtils.deviceStatusFrom(
          response.status,
        );
        deviceStatusResponse.time = new Date(response.createTime);

        history.set(deviceStatusResponse.deviceId, deviceStatusResponse.status);

        // calculate the proper rate due to changed
        properRateResponse.total = [...history.entries()].length;
        properRateResponse.errors = [...history.entries()].filter((entry) => {
          return entry[1] === DeviceStatus.ERROR;
        }).length;
        const properRateInPercentage =
          ((properRateResponse.total - properRateResponse.errors) /
            properRateResponse.total) *
          100;
        properRateResponse.properRate = Math.round(properRateInPercentage);
        properRateResponse.time = new Date();

        void this.pubSub.publish(redisTopic, {
          properRateChanged: properRateResponse,
        });
      },
      (clients, messageCallback) => {
        return this.deviceOnMongoChanged(() => {
          void (async () => {
            // unsubscribe all topics
            setting.options.forEach((option) => {
              const client = clients.get(option.username);
              option.mqttTopics.forEach((topic) => {
                client.unsubscribe(topic, { qos: 0 }, (error, _qos) => {
                  if (error) {
                    this.logger.error(`[MQTT][ERROR]: ${error.message}`);
                  }
                });
              });
            });

            setting = await this.mqttSettingFromGroup(
              groupId,
              MqttTopicType.STATUS,
            );

            // remove the unused history
            let validIds: string[] = [];
            setting.data.forEach((devices, _) => {
              validIds = validIds.concat(devices.map((it) => it.deviceId));
            });
            history.forEach((_, deviceId) => {
              if (!validIds.includes(deviceId)) {
                history.delete(deviceId);
              }
            });

            // subscribe all topics
            setting.options.forEach((option) => {
              let client = clients.get(option.username);
              if (client === undefined) {
                client = connect(
                  this.configService.get<string>('CHTIOT_MQTT_URI'),
                  option,
                );

                client.on('connect', () => {
                  option.mqttTopics.forEach((topic) => {
                    client.subscribe(topic, { qos: 0 }, (error, _qos) => {
                      if (error) {
                        this.logger.error(`[MQTT][ERROR]: ${error.message}`);
                      }
                    });
                  });
                });

                client.on('message', messageCallback);

                clients.set(option.username, client);
              }
              option.mqttTopics.forEach((topic) => {
                client.subscribe(topic, { qos: 0 }, (error, _qos) => {
                  if (error) {
                    this.logger.error(`[MQTT][ERROR]: ${error.message}`);
                  }
                });
              });
            });
          })();
        });
      },
    );
  }

  async sensorValueStatsHistory(
    esSensor: ElasticSearchSensor,
    devices: Device[],
    option: StatsOption,
    interval: number,
  ): Promise<ISensorData[]> {
    const response: GaugeSensorData[] = [];
    switch (esSensor.sensorType) {
      case SensorType.GAUGE: {
        const result = await this.elasticsearchService
          .search<SearchResponse<any>>({
            index: this.elasticsearchSensorService.getIndexName(
              esSensor.deviceType,
              esSensor.sensorId,
            ),
            body: {
              size: 0,
              query: {
                bool: {
                  filter: [
                    {
                      terms: {
                        deviceId: devices.map((d) => d.deviceId),
                      },
                    },
                    {
                      range: {
                        time: {
                          gte: StringUtils.dateToTimestampMilli(esSensor.from),
                          lt: StringUtils.dateToTimestampMilli(esSensor.to),
                        },
                      },
                    },
                  ],
                },
              },
              aggs: {
                latest: {
                  date_histogram: {
                    field: 'time',
                    fixed_interval: `${interval}m`,
                    time_zone: 'Asia/Taipei',
                  },
                  aggs: {
                    result: {
                      stats: {
                        field: 'value',
                      },
                    },
                  },
                },
              },
            },
          })
          .catch((_error) => {
            this.logger.error(_error);
            throw new ApolloError(
              `Cannot find the index created in the elasticsearch. Please sync the data from CHT IOT first.`,
              ErrorCode.ELASTIC_SEARCH_INDEX_NOT_FOUND,
            );
          });

        (
          result.body.aggregations as unknown as ESSensorStatsAggregations
        ).latest.buckets.forEach((bucket) => {
          const data = new GaugeSensorData();
          data.type = SensorType.GAUGE;
          data.time = new Date(bucket.key);
          switch (option.operation) {
            case ExtremeOperation.COUNT: {
              data.value = bucket.result.count;
              break;
            }
            case ExtremeOperation.MAX: {
              data.value = bucket.result.max;
              break;
            }
            case ExtremeOperation.MIN: {
              data.value = bucket.result.min;
              break;
            }
            case ExtremeOperation.AVG: {
              data.value = bucket.result.avg;
              break;
            }
            case ExtremeOperation.SUM: {
              data.value = bucket.result.sum;
              break;
            }
          }

          response.push(data);
        });
        break;
      }
      case SensorType.TEXT: {
        const result = await this.elasticsearchService
          .search<SearchResponse<any>>({
            index: this.elasticsearchSensorService.getIndexName(
              esSensor.deviceType,
              esSensor.sensorId,
            ),
            body: {
              size: 0,
              query: {
                bool: {
                  filter: [
                    {
                      term: {
                        value: option.text,
                      },
                    },
                    {
                      terms: {
                        deviceId: devices.map((d) => d.deviceId),
                      },
                    },
                    {
                      range: {
                        time: {
                          gte: StringUtils.dateToTimestampMilli(esSensor.from),
                          lt: StringUtils.dateToTimestampMilli(esSensor.to),
                        },
                      },
                    },
                  ],
                },
              },
              aggs: {
                latest: {
                  date_histogram: {
                    field: 'time',
                    fixed_interval: `${interval}m`,
                    time_zone: 'Asia/Taipei',
                  },
                },
              },
            },
          })
          .catch((_error) => {
            this.logger.error(_error);
            throw new ApolloError(
              `Cannot find the index created in the elasticsearch. Please sync the data from CHT IOT first.`,
              ErrorCode.ELASTIC_SEARCH_INDEX_NOT_FOUND,
            );
          });

        (
          result.body.aggregations as unknown as ESSensorStatsAggregations
        ).latest.buckets.forEach((bucket) => {
          const data = new GaugeSensorData();
          data.type = SensorType.GAUGE;
          data.time = new Date(bucket.key);
          data.value = bucket.doc_count;

          response.push(data);
        });
        break;
      }
    }

    return response;
  }

  async sensorValueStatsChanged(
    redisTopic: string,
    groupId: string,
    deviceType: DeviceType,
    sensorId: string,
    days: number,
    operation: ExtremeOperation,
  ): Promise<AsyncIterator<unknown>> {
    let setting = await this.mqttSettingFromGroup(
      groupId,
      MqttTopicType.SENSOR,
      deviceType,
      sensorId,
    );

    let initCompleted = false;

    void this.publishSensorValueStatsChanged(
      redisTopic,
      setting.data,
      sensorId,
      days,
      operation,
    );

    // prohibit from calling too may IOT APIs at first
    setTimeout(() => {
      initCompleted = true;
    }, 6000);

    return this.subscribeToMqtt(
      redisTopic,
      setting.options,
      (_mqttTopic, message) => {
        const response = JSON.parse(message.toString()) as MqttSensorResponse;
        this.logger.debug(
          `[MQTT][sensorValueStatsChanged]: ${JSON.stringify(response)}`,
        );

        if (initCompleted) {
          // delay for 3 seconds due to IOT cannot save the data immediately
          initCompleted = false;
          setTimeout(() => {
            void this.publishSensorValueStatsChanged(
              redisTopic,
              setting.data,
              sensorId,
              days,
              operation,
            );
            initCompleted = true;
          }, 3000);
        }
      },
      (clients, messageCallback) => {
        return this.deviceOnMongoChanged(() => {
          void (async () => {
            // unsubscribe all topics
            setting.options.forEach((option) => {
              const client = clients.get(option.username);
              option.mqttTopics.forEach((topic) => {
                client.unsubscribe(topic, { qos: 0 }, (error, _qos) => {
                  if (error) {
                    this.logger.error(`[MQTT][ERROR]: ${error.message}`);
                  }
                });
              });
            });

            setting = await this.mqttSettingFromGroup(
              groupId,
              MqttTopicType.SENSOR,
              deviceType,
              sensorId,
            );

            let validIds: string[] = [];
            setting.data.forEach((devices, _) => {
              validIds = validIds.concat(devices.map((it) => it.deviceId));
            });

            // subscribe all topics
            setting.options.forEach((option) => {
              let client = clients.get(option.username);
              if (client === undefined) {
                client = connect(
                  this.configService.get<string>('CHTIOT_MQTT_URI'),
                  option,
                );

                client.on('connect', () => {
                  option.mqttTopics.forEach((topic) => {
                    client.subscribe(topic, { qos: 0 }, (error, _qos) => {
                      if (error) {
                        this.logger.error(`[MQTT][ERROR]: ${error.message}`);
                      }
                    });
                  });
                });

                client.on('message', messageCallback);

                clients.set(option.username, client);
              }
              option.mqttTopics.forEach((topic) => {
                client.subscribe(topic, { qos: 0 }, (error, _qos) => {
                  if (error) {
                    this.logger.error(`[MQTT][ERROR]: ${error.message}`);
                  }
                });
              });
            });

            /* if (validIds.includes(newDevice?.deviceId) || newDevice === null) {
              void this.publishSensorValueStatsChanged(
                redisTopic,
                setting.data,
                sensorId,
                days,
                operation,
              );
            } */
          })();
        });
      },
    );
  }

  private isValidEditSensorInput(editSensorInput: EditSensorInput): boolean {
    if (editSensorInput.name !== undefined) {
      if (editSensorInput.name === null || editSensorInput.name.length > 255) {
        return false;
      }
    }

    if (editSensorInput.desc) {
      if (editSensorInput.desc.length > 2000) {
        return false;
      }
    }

    if (editSensorInput.unit) {
      if (editSensorInput.unit.length > 32) {
        return false;
      }
    }

    if (editSensorInput.attributes) {
      const invalid = editSensorInput.attributes.some((attribute) => {
        if (attribute.key.length > 200 || attribute.value.length > 200) {
          return true;
        }
        return false;
      });
      if (invalid) {
        return false;
      }
    }

    return true;
  }

  private subscribeToMqtt(
    redisTopic: string,
    options: MqttOption[], // each option represents for one mqtt connection
    onMessageCallback: (topic: string, payload: Buffer) => void,
    onClientCreated?: (
      clients: Map<string, MqttClient>,
      messageCallback: (topic: string, payload: Buffer) => void,
    ) => ChangeStream,
  ) {
    const clients: Map<string, MqttClient> = new Map();

    options.forEach((option) => {
      const client = connect(
        this.configService.get<string>('CHTIOT_MQTT_URI'),
        option,
      );

      client.on('connect', () => {
        option.mqttTopics.forEach((topic) => {
          client.subscribe(topic, { qos: 0 }, (error, _qos) => {
            if (error) {
              this.logger.error(`[MQTT][ERROR]: ${error.message}`);
            }
          });
        });
      });

      client.on('message', onMessageCallback);

      clients.set(option.username, client);
    });

    let stream: ChangeStream;
    if (onClientCreated) {
      stream = onClientCreated(clients, onMessageCallback);
    }

    return withCancel(this.pubSub.asyncIterator(redisTopic), () => {
      this.logger.debug(
        `[MQTT][Close]: Subscription closed, try to end the mqtt for ${redisTopic}`,
      );
      clients.forEach((client) => client.end());
      void stream?.close();
    });
  }

  private async serverListenerForDeviceStatus() {
    const rootGroup = await this.groupService.getRootGroup();
    let setting = await this.mqttSettingFromGroup(
      rootGroup.id,
      MqttTopicType.STATUS,
    );

    this.subscribeToMqtt(
      Constants.DEVICE_STATUS_FOR_STSTEM_TOPIC,
      setting.options,
      (_mqttTopic, message) => {
        const response = JSON.parse(message.toString()) as MqttStatusResponse;
        // success: { deviceId: "...", createTime: "2022-07-15T09:30:15.059Z", status: "offline" }
        // error: {"result":false,"message":"You cannot access - unknow key type","topic":"/v1/device/31642577701/active"}
        if (response.deviceId === undefined) {
          this.logger.error(
            `[MQTT] listen deviceStatus with error: ${JSON.stringify(
              response,
            )}`,
          );
          return;
        }

        const deviceStatusResponse = new DeviceStatusResponse();
        deviceStatusResponse.deviceId = response.deviceId;
        deviceStatusResponse.status = StringUtils.deviceStatusFrom(
          response.status,
        );
        deviceStatusResponse.time = new Date(response.createTime);

        // alse update the status on cityos' database
        void this.deviceService.updateDeviceStatus(
          deviceStatusResponse.deviceId,
          deviceStatusResponse.status,
        );

        // write the data to ElasticSearch
        const timestampInMilli = StringUtils.dateToTimestampMilli(
          deviceStatusResponse.time,
        );

        void this.elasticsearchService.index({
          index: this.deviceStatusIndexName,
          id: `${Constants.INDEX_FOR_DEVICE_STATUS}.${deviceStatusResponse.deviceId}.${timestampInMilli}`,
          body: {
            deviceId: deviceStatusResponse.deviceId,
            time: timestampInMilli,
            status: response.status,
          },
        });
      },
      (clients, messageCallback) => {
        return this.deviceOnMongoChanged(() => {
          void (async () => {
            // unsubscribe all topics
            setting.options.forEach((option) => {
              const client = clients.get(option.username);
              option.mqttTopics.forEach((topic) => {
                client.unsubscribe(topic, { qos: 0 }, (error, _qos) => {
                  if (error) {
                    this.logger.error(`[MQTT][ERROR]: ${error.message}`);
                  }
                });
              });
            });

            setting = await this.mqttSettingFromGroup(
              rootGroup.id,
              MqttTopicType.STATUS,
            );

            // subscribe all topics
            setting.options.forEach((option) => {
              let client = clients.get(option.username);
              if (client === undefined) {
                client = connect(
                  this.configService.get<string>('CHTIOT_MQTT_URI'),
                  option,
                );

                client.on('connect', () => {
                  option.mqttTopics.forEach((topic) => {
                    client.subscribe(topic, { qos: 0 }, (error, _qos) => {
                      if (error) {
                        this.logger.error(`[MQTT][ERROR]: ${error.message}`);
                      }
                    });
                  });
                });

                client.on('message', messageCallback);

                clients.set(option.username, client);
              }
              option.mqttTopics.forEach((topic) => {
                client.subscribe(topic, { qos: 0 }, (error, _qos) => {
                  if (error) {
                    this.logger.error(`[MQTT][ERROR]: ${error.message}`);
                  }
                });
              });
            });
          })();
        });
      },
    );
  }

  private async updateDeviceStatusToES(timestampInMilli: number) {
    const result = await this.elasticsearchService.search<
      SearchResponse<ESDeviceStatus>
    >({
      index: this.deviceStatusIndexName,
      body: {
        size: 0,
        aggs: {
          latest: {
            terms: {
              field: 'deviceId',
              size: 100000,
            },
            aggs: {
              latest: {
                top_hits: {
                  sort: [
                    {
                      time: {
                        order: 'desc',
                      },
                    },
                  ],
                  size: 1,
                },
              },
            },
          },
        },
      },
    });

    (
      result.body
        .aggregations as unknown as ESLatestAggregations<ESDeviceStatus>
    ).latest.buckets.forEach((bucket) => {
      bucket.latest.hits.hits.forEach((hit) => {
        const data = hit._source;
        void this.elasticsearchService.index({
          index: this.hourlyStatusIndexName,
          id: `${Constants.INDEX_FOR_DEVICE_STATUS}.${data.deviceId}.${timestampInMilli}`,
          body: {
            deviceId: data.deviceId,
            time: timestampInMilli,
            status: StringUtils.deviceStatusFrom(data.status),
          },
        });
      });
    });

    await this.elasticsearchService.indices.refresh({
      index: this.deviceStatusIndexName,
    });
  }

  private async publishSensorValueStatsChanged(
    redisTopic: string,
    // projectKey, devices
    inputs: Map<string, Device[]>,
    sensorId: string,
    days: number,
    operation: ExtremeOperation,
  ) {
    let total = 0;

    for (const [projectKey, devices] of inputs.entries()) {
      const result = await Promise.all(
        devices.flatMap(async (device) => {
          const sensor = device.getSensor(sensorId);
          const response =
            await this.chtiotClientService.sensorValuesStatisticHistory(
              projectKey,
              device.deviceId,
              sensor.iotSensorId,
              DateTime.now().minus({ day: days }).toJSDate(),
              new Date(),
              days * 1440,
              operation,
            );

          return (response[response.length - 1] as GaugeSensorData)?.value || 0;
        }),
      );

      total += result.reduce<number>(
        (acc: number, val: number) => acc + val,
        0,
      );
    }

    const gaugeSensorData = new GaugeSensorData();
    gaugeSensorData.type = SensorType.GAUGE;
    gaugeSensorData.time = new Date();
    gaugeSensorData.value = total;

    void this.pubSub.publish(redisTopic, {
      sensorValueStatsChanged: gaugeSensorData,
    });
  }

  parseMqttSensorResponse(
    sensorType: SensorType,
    data: MqttSensorResponse,
    sensorId: string,
  ): SensorResponse {
    this.logger.debug(`[parseMqttSensorResponse]: ${JSON.stringify(data)}`);

    const sensorResponse = new SensorResponse();
    sensorResponse.deviceId = data.deviceId;
    // notice: do not expose the sensorId in the IOT to the CityOS' user
    sensorResponse.sensorId = sensorId;

    switch (sensorType) {
      case SensorType.GAUGE: {
        const gaugeSensorData = new GaugeSensorData();
        gaugeSensorData.type = SensorType.GAUGE;
        gaugeSensorData.time = new Date(data.time);
        gaugeSensorData.value = parseFloat(data.value);
        sensorResponse.data = gaugeSensorData;
        break;
      }
      case SensorType.SNAPSHOT: {
        const snapshotSensorData = new SnapshotSensorData();
        snapshotSensorData.type = SensorType.SNAPSHOT;
        snapshotSensorData.time = new Date(data.time);
        const snapshotId = data.value
          .toString()
          .split(',')[0]
          .replace('snapshot://', ''); // data.value should be 'snapshot://f4fe4b4b-8c2c-4149-865f-02847ca21b2e,cat'
        snapshotSensorData.value = `${this.configService.get<string>(
          'CHTIOT_SERVER_URI',
        )}/device/${data.deviceId}/sensor/${data.id}/snapshot/${snapshotId}`;
        sensorResponse.data = snapshotSensorData;
        break;
      }
      case SensorType.TEXT: {
        const textSensorData = new TextSensorData();
        textSensorData.type = SensorType.TEXT;
        textSensorData.time = new Date(data.time);
        textSensorData.value = data.value.toString();
        sensorResponse.data = textSensorData;
        break;
      }
      case SensorType.SWITCH: {
        const switchSensorData = new SwitchSensorData();
        switchSensorData.type = SensorType.SWITCH;
        switchSensorData.time = new Date(data.time);
        switchSensorData.value = parseFloat(data.value) > 0;
        sensorResponse.data = switchSensorData;
        break;
      }
      default: {
        throw new ApolloError(
          `Type for this sensor type not supported.`,
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      }
    }
    return sensorResponse;
  }

  private async mqttSettingFromGroup(
    groupId: string,
    topicType: MqttTopicType,
    deviceType?: DeviceType,
    sensorId?: string,
  ): Promise<MqttSetting> {
    let devices: Device[];
    switch (topicType) {
      case MqttTopicType.SENSOR: {
        devices = await this.deviceService.getDevicesUnderGroup(
          groupId,
          deviceType,
          sensorId,
        );
        break;
      }
      case MqttTopicType.STATUS: {
        devices = await this.deviceService.getDevicesUnderGroup(groupId);
        break;
      }
    }

    const inputs = new Map<string, Device[]>();
    for (const device of devices) {
      const projectKey = device.groups[0].projectKey;
      if (projectKey != null) {
        if (inputs.get(projectKey) === undefined) {
          inputs.set(projectKey, [device]);
        } else {
          inputs.get(projectKey).push(device);
        }
      }
    }

    const options: MqttOption[] = [];
    inputs.forEach((values, projectKey) => {
      const option: MqttOption = {
        username: projectKey,
        password: projectKey,
        mqttTopics: values.map((device) => {
          switch (topicType) {
            case MqttTopicType.SENSOR:
              const sensor = device.getSensor(sensorId);
              return `/v1/device/${device.deviceId}/sensor/${sensor.iotSensorId}/rawdata`;
            case MqttTopicType.STATUS:
              return `/v1/device/${device.deviceId}/active`;
          }
        }),
      };
      options.push(option);
    });

    const setting: MqttSetting = {
      options,
      data: inputs,
      total: devices.length,
    };

    return setting;
  }

  private deviceOnMongoChanged(
    onDeviceAdded: (device?: Device) => void,
  ): ChangeStream<Document> {
    return this.deviceService.deviceOnMongoChanged(onDeviceAdded);
  }

  async sensorValuesMetricAggregation(
    device: Device,
    sensorId: string,
    start: Date,
    end: Date,
  ): Promise<MetricAggregationResponse> {
    const result = await this.elasticsearchService
      .search<SearchResponse<any>>({
        index: this.elasticsearchSensorService.getIndexName(
          device.type,
          sensorId,
        ),
        body: {
          size: 0,
          query: {
            bool: {
              filter: [
                {
                  term: {
                    deviceId: device.deviceId,
                  },
                },
                {
                  range: {
                    time: {
                      gte: StringUtils.dateToTimestampMilli(start),
                      lt: StringUtils.dateToTimestampMilli(end),
                    },
                  },
                },
              ],
            },
          },
          aggs: {
            latest: {
              date_histogram: {
                field: 'time',
                fixed_interval: `${end.getTime() - start.getTime()}s`,
                time_zone: 'Asia/Taipei',
              },
              aggs: {
                result: {
                  stats: {
                    field: this.elasticsearchSensorService.isCameraSensor(
                      sensorId,
                    )
                      ? sensorId
                      : 'value',
                  },
                },
              },
            },
          },
        },
      })
      .catch((_error) => {
        this.logger.error(_error);
        throw new ApolloError(
          `Cannot find the index created in the elasticsearch. Please sync the data from CHT IOT first.`,
          ErrorCode.ELASTIC_SEARCH_INDEX_NOT_FOUND,
        );
      });

    const res: MetricAggregationResponse = {
      min: null,
      max: null,
      avg: null,
      sum: null,
      count: null,
    };

    const currentResult = (
      result.body.aggregations as unknown as ESSensorStatsAggregations
    ).latest.buckets;

    if (currentResult.length > 0) {
      const latest = currentResult[currentResult.length - 1];
      res.min = latest.result.min;
      res.max = latest.result.max;
      res.avg = latest.result.avg;
      res.sum = latest.result.sum;
      res.count = latest.result.count;
    }

    return res;
  }

  async sensorValuesAvgHistory(
    device: Device,
    sensorId: string,
    start: Date,
    end: Date,
    interval: number,
  ): Promise<ISensorData[]> {
    const response: GaugeSensorData[] = [];
    const result = await this.elasticsearchService
      .search<SearchResponse<any>>({
        index: this.elasticsearchSensorService.getIndexName(
          device.type,
          sensorId,
        ),
        body: {
          size: 0,
          query: {
            bool: {
              filter: [
                {
                  term: {
                    deviceId: device.deviceId,
                  },
                },
                {
                  range: {
                    time: {
                      gte: StringUtils.dateToTimestampMilli(start),
                      lt: StringUtils.dateToTimestampMilli(end),
                    },
                  },
                },
              ],
            },
          },
          aggs: {
            latest: {
              date_histogram: {
                field: 'time',
                fixed_interval: `${interval}m`,
                time_zone: 'Asia/Taipei',
              },
              aggs: {
                result: {
                  avg: {
                    field: this.elasticsearchSensorService.isCameraSensor(
                      sensorId,
                    )
                      ? sensorId
                      : 'value',
                  },
                },
              },
            },
          },
        },
      })
      .catch((_error) => {
        this.logger.error(_error);
        throw new ApolloError(
          `Cannot find the index created in the elasticsearch. Please sync the data from CHT IOT first.`,
          ErrorCode.ELASTIC_SEARCH_INDEX_NOT_FOUND,
        );
      });

    (
      result.body.aggregations as unknown as ESSensorSumAggregations
    ).latest.buckets.forEach((bucket) => {
      const data = new GaugeSensorData();
      data.type = SensorType.GAUGE;
      data.time = new Date(bucket.key);
      data.value = bucket.result.value;

      response.push(data);
    });

    return response;
  }

  async sensorValuesRawHistory(
    device: Device,
    sensorId: string,
    start: Date,
    end: Date,
    from = 0,
    size = 10000,
  ): Promise<ISensorData[]> {
    const sensorType = device.sensors.find(
      (sensor) => sensor.sensorId === sensorId,
    )?.type;

    const response: ISensorData[] = [];

    const result = await this.elasticsearchService
      .search<SearchResponse<any>>({
        index: this.elasticsearchSensorService.getIndexName(
          device.type,
          sensorId,
        ),
        body: {
          from,
          size,
          query: {
            bool: {
              filter: [
                {
                  term: {
                    deviceId: device.deviceId,
                  },
                },
                {
                  range: {
                    time: {
                      gte: StringUtils.dateToTimestampMilli(start),
                      lt: StringUtils.dateToTimestampMilli(end),
                    },
                  },
                },
              ],
            },
          },
        },
      })
      .catch((_error) => {
        this.logger.error(_error);
        // 沒有 Index 就跟乾脆回傳空陣列，反正提醒使用者也沒用
        // throw new ApolloError(
        //   `Cannot find the index created in the elasticsearch. Please sync the data from CHT IOT first.`,
        //   ErrorCode.ELASTIC_SEARCH_INDEX_NOT_FOUND,
        // );
        // return [];
      });

    if (!result) return [];

    const hits = (result.body.hits as unknown as ESSensorRaw).hits;

    switch (sensorType) {
      case SensorType.GAUGE: {
        hits.forEach(({ _source: data }) => {
          const gaugeSensorData = new GaugeSensorData();

          gaugeSensorData.type = SensorType.GAUGE;
          gaugeSensorData.time = new Date(data.time);
          gaugeSensorData.value = data.value;

          response.push(gaugeSensorData);
        });
        break;
      }
      case SensorType.SNAPSHOT: {
        hits.forEach(({ _source: data }) => {
          const snapshotSensorData = new SnapshotSensorData();

          snapshotSensorData.type = SensorType.SNAPSHOT;
          snapshotSensorData.time = new Date(data.time);
          const snapshotId = data.value
            .toString()
            .split(',')[0]
            .replace('snapshot://', ''); // data.value should be 'snapshot://f4fe4b4b-8c2c-4149-865f-02847ca21b2e,cat'
          snapshotSensorData.value = `${this.configService.get<string>(
            'CHTIOT_SERVER_URI',
          )}/device/${data.deviceId}/sensor/${sensorId}/snapshot/${snapshotId}`;

          response.push(snapshotSensorData);
        });
        break;
      }
      case SensorType.TEXT: {
        hits.forEach(({ _source: data }) => {
          const textSensorData = new TextSensorData();

          textSensorData.type = SensorType.TEXT;
          textSensorData.time = new Date(data.time);
          textSensorData.value = data.value.toString();

          response.push(textSensorData);
        });
        break;
      }
      case SensorType.SWITCH: {
        hits.forEach(({ _source: data }) => {
          const switchSensorData = new SwitchSensorData();

          switchSensorData.type = SensorType.SWITCH;
          switchSensorData.time = new Date(data.time);
          switchSensorData.value = data.value > 0;

          response.push(switchSensorData);
        });
        break;
      }

      default: {
        throw new ApolloError(
          `Type for this sensor type not supported.`,
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      }
    }

    return response;
  }

  async multiSensorValuesRawHistory(
    device: Device,
    sensorIds: string[],
    start: Date,
    end: Date,
    from = 0,
    size = 10000,
  ): Promise<MultiISensorData[]> {
    const jobs = sensorIds.map((sensorId) =>
      this.sensorValuesRawHistory(device, sensorId, start, end, from, size),
    );

    const jobResList = await Promise.all(jobs);

    const response: MultiISensorData[] = jobResList.map(
      (jobRes: ISensorData[], index: number) => ({
        sensorId: sensorIds[index],
        sensorData: jobRes,
      }),
    );

    return response;
  }

  async sensorValuesPredict(
    device: Device,
    sensorId: string,
    seasonalityPeriod: number,
    mode: ExtremeOperation,
    start: Date,
    end: Date,
    interval: number,
    pastInterval: number,
    lowerBound: number,
    upperBound: number,
  ): Promise<ISensorData[]> {
    const response: GaugeSensorData[] = [];
    let pastData: GaugeSensorData[] = [];

    if (mode === ExtremeOperation.SUM) {
      pastData = (await this.sensorValuesHistory(
        device,
        sensorId,
        new Date(start.getTime() - pastInterval * 1000),
        start,
        interval,
      )) as unknown as GaugeSensorData[];
    } else {
      pastData = (await this.sensorValuesAvgHistory(
        device,
        sensorId,
        new Date(start.getTime() - pastInterval * 1000),
        start,
        interval,
      )) as unknown as GaugeSensorData[];
    }

    const pastDataArray = [];
    pastData.forEach((entry) => {
      pastDataArray.push(entry.value);
    });

    const options = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const data = {
      seasonality_period: seasonalityPeriod,
      periods:
        Math.round(
          (end.getTime() - start.getTime()) / (interval * 60 * 1000),
        ) || 7,
      data: pastDataArray,
      lower_bound: lowerBound,
      upper_bound: upperBound,
    };

    const prediction = this.httpService
      .post(`${this.deepflowUrl}`, data, options)
      .toPromise()
      .then((res: AxiosResponse<Array<number>>) => res.data)
      .catch((error: AxiosError) => {
        this.logger.error(
          `Prediction in the DeepFlow failed with error = ${error.message}.`,
        );
        throw new ApolloError(
          `Retrieve prediction values fail with error ${error.message}.`,
          ErrorCode.DEEPFLOW_API_ERROR,
        );
      });

    (await prediction).forEach((value, idx) => {
      const d = new GaugeSensorData();
      d.type = SensorType.GAUGE;
      d.time = new Date(start.getTime() + idx * interval * 60 * 1000);
      d.value = value;
      response.push(d);
    });

    return response;
  }
}
