import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { DeviceService } from '../device/device.service';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Job } from 'bull';
import { GroupService } from '../group/group.service';
import { ElasticSearchInput, ISensorData } from 'src/graphql.schema';
import {
  ElasticSearchSensor,
  ElasticSearchSensorDocument,
} from 'src/models/elasticsearch.sensor';
import { Constants } from 'src/constants';
import { ElasticsearchSensorService } from './elasticsearch-sensor.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Processor('elasticsearch')
@Injectable()
export class ElasticSearchProcessor {
  constructor(
    private readonly elasticsearchSensorService: ElasticsearchSensorService,
    private readonly chtiotClientService: ChtiotClientService,
    @Inject(forwardRef(() => DeviceService))
    private readonly deviceService: DeviceService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    private readonly elasticsearchService: ElasticsearchService,
    @InjectModel(ElasticSearchSensor.name)
    private readonly esSensorModel: Model<ElasticSearchSensorDocument>,
  ) {}

  private readonly logger = new Logger(ElasticSearchProcessor.name);

  @Process(Constants.BULL_TASK_INIT_ES_RESPONSE)
  initEsResponse() {}

  @Process(Constants.BULL_TASK_SYNC_ELASTICSEARCH)
  async syncElasticsearch(job: Job<ElasticSearchInput>) {
    const elasticSearchInput = job.data;
    elasticSearchInput.to = elasticSearchInput.to || new Date();
    const from = new Date(elasticSearchInput.from);
    const to = new Date(elasticSearchInput.to);

    const esSensor = await this.esSensorModel.findOneAndUpdate(
      {
        deviceType: elasticSearchInput.deviceType,
        sensorId: elasticSearchInput.sensorId,
      },
      {
        status: 0,
      },
      {
        new: true,
      },
    );

    // make sure the index existed in the elasticsearch
    await this.elasticsearchSensorService.createESIndexForSensor(esSensor);

    const groups = await this.groupService.gorupsForProjectLevel();

    const totalProgress = 100 * groups.length;
    let completedProgress = 0;

    for (const group of groups) {
      const progressForDevices = {};
      const devices = await this.deviceService.getDevicesUnderGroup(
        group.id,
        elasticSearchInput.deviceType,
        elasticSearchInput.sensorId,
      );
      this.logger.log(`[addToElasticSearch] Process ${group.name}...`);

      await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        devices.flatMap(async (device) => {
          const sensor = device.getSensor(elasticSearchInput.sensorId);
          const sensorType = sensor.type;
          let history: ISensorData[] = [];

          elasticSearchInput.from = from;

          do {
            if (!this.elasticsearchSensorService.processControl.get(job.id)) {
              return;
            }

            history = await this.chtiotClientService.sensorValuesRawHistory(
              group.projectKey,
              device.deviceId,
              sensor.iotSensorId,
              sensorType,
              new Date(elasticSearchInput.from),
              new Date(elasticSearchInput.to),
            );
            this.logger.log(
              `[addToElasticSearch] Device: ${device.deviceId} ${device.name} with ${history.length} data}`,
            );

            // write the data to the elasticsearch
            history.forEach((it) => {
              if (
                this.elasticsearchSensorService.isCameraSensor(
                  esSensor.sensorId,
                )
              ) {
                void this.elasticsearchSensorService.saveCameraSensorsToElasticsearch(
                  device.deviceId,
                  device.type,
                  device.recognitionType(),
                  esSensor.sensorId,
                  it,
                );
              } else {
                void this.elasticsearchSensorService.saveSensorValueToElasticsearch(
                  device.deviceId,
                  esSensor.deviceType,
                  esSensor.sensorId,
                  it,
                );
              }
            });

            if (history.length === 0) break;

            const lastDocument = history[history.length - 1];

            // calculate the progress
            const p = this.percentage(
              lastDocument.time.getTime() - from.getTime(),
              to.getTime() - from.getTime(),
            );
            progressForDevices[device.deviceId] = p;

            const progressSumForDevices = Object.values(
              progressForDevices,
            ).reduce<number>((acc: number, val: number) => acc + val, 0);
            const progressAvgForDevices =
              progressSumForDevices / Object.keys(progressForDevices).length;

            const devicesProgress = this.percentage(
              completedProgress + progressAvgForDevices,
              totalProgress,
            );
            await this.elasticsearchSensorService.onProgressChanged(
              esSensor,
              from,
              to,
              devicesProgress,
            );

            elasticSearchInput.from = lastDocument?.time;
          } while (history.length > 1);
        }),
      );
      completedProgress += 100;
    }

    await this.elasticsearchService.indices.refresh({
      index: this.elasticsearchSensorService.getIndexName(
        esSensor.deviceType,
        esSensor.sensorId,
      ),
    });

    this.logger.log(
      `[addToElasticSearch] Sync from IOT to elasticsearch completed for ${esSensor.deviceType} - ${esSensor.sensorId}`,
    );

    await this.elasticsearchSensorService.onProgressChanged(
      esSensor,
      from,
      to,
      100,
    );
  }

  @OnQueueActive()
  async onActive(job: Job<ElasticSearchInput>) {
    this.logger.log(`Processing job ${job.id} with ${job.name} ...`);
    const elasticSearchInput = job.data;
    const esSensor = await this.esSensorModel.findOne({
      deviceType: elasticSearchInput.deviceType,
      sensorId: elasticSearchInput.sensorId,
    });

    await this.elasticsearchSensorService.onProgressChanged(
      esSensor,
      esSensor.from,
      esSensor.to,
      esSensor.status,
    );
  }

  @OnQueueFailed()
  async onFailed(job: Job<ElasticSearchInput>, err: Error) {
    this.logger.error(
      `Failed job ${job.id} of ${job.name} with error ${err.message}.`,
    );

    // delete from the processControl
    this.elasticsearchSensorService.processControl.delete(job.id);

    // error handling when something wrong
    const elasticSearchInput = job.data;
    elasticSearchInput.to = elasticSearchInput.to || new Date();
    const from = new Date(elasticSearchInput.from);
    const to = new Date(elasticSearchInput.to);

    const esSensor = await this.esSensorModel.findOneAndUpdate(
      {
        deviceType: elasticSearchInput.deviceType,
        sensorId: elasticSearchInput.sensorId,
      },
      {
        status: 100,
        enable: false,
      },
      {
        new: true,
      },
    );

    // delete the previous added documents in the elasticsearch
    await this.elasticsearchSensorService.deleteFromElasticSearch(
      esSensor,
      from,
      to,
    );

    await this.elasticsearchSensorService.onProgressChanged(
      esSensor,
      esSensor.from,
      esSensor.to,
      esSensor.status,
    );
  }

  @OnQueueCompleted()
  OnCompleted(job: Job, _result: any) {
    this.logger.log(`Complete job ${job.id} of ${job.name}.`);

    // delete from the processControl
    this.elasticsearchSensorService.processControl.delete(job.id);
  }

  private percentage(number: number, total: number): number {
    return Math.floor((number / total) * 100);
  }
}
