import { forwardRef, Module } from '@nestjs/common';
import { ElasticsearchSensorService } from './elasticsearch-sensor.service';
import { ElasticsearchSensorResolver } from './elasticsearch-sensor.resolver';
import {
  ElasticSearchSensor,
  ElasticSearchSensorSchema,
} from 'src/models/elasticsearch.sensor';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { SensorModule } from '../sensor/sensor.module';
import { DeviceModule } from '../device/device.module';
import { GroupModule } from '../group/group.module';
import { LogModule } from '../log/log.module';
import { PermissionModule } from '../permission/permission.module';
import { ElasticSearchProcessor } from './elasticsearch.processor';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: ElasticSearchSensor.name,
        schema: ElasticSearchSensorSchema,
        collection: 'elasticsearch_sensors',
      },
    ]),
    ElasticsearchModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        node: configService.get<string>('ELASTICSEARCH_URI'),
        auth: {
          username: configService.get<string>('ELASTICSEARCH_USERNAME'),
          password: configService.get<string>('ELASTICSEARCH_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: 'elasticsearch',
    }),
    ChtiotClientModule,
    forwardRef(() => DeviceModule),
    forwardRef(() => GroupModule),
    forwardRef(() => SensorModule),
    PermissionModule,
    LogModule,
  ],
  providers: [
    ElasticsearchSensorResolver,
    ElasticsearchSensorService,
    ElasticSearchProcessor,
  ],
  exports: [ElasticsearchSensorService],
})
export class ElasticsearchSensorModule {}
