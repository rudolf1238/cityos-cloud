import { forwardRef, Module } from '@nestjs/common';
import { Sensor, SensorSchema } from 'src/models/sensor';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SensorService } from './sensor.service';
import {
  SensorDataResolver,
  SensorResolver,
  SensorResponseResolver,
} from './sensor.resolver';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { DeviceModule } from '../device/device.module';
import { PermissionModule } from '../permission/permission.module';
import { LogModule } from '../log/log.module';
import { GroupModule } from '../group/group.module';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ScheduleModule } from '@nestjs/schedule';
import { ElasticsearchSensorModule } from '../elasticsearch-sensor/elasticsearch-sensor.module';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Sensor.name,
        schema: SensorSchema,
        collection: 'sensors',
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
    HttpModule,
    ConfigModule,
    ChtiotClientModule,
    forwardRef(() => DeviceModule),
    forwardRef(() => GroupModule),
    forwardRef(() => ElasticsearchSensorModule),
    PermissionModule,
    LogModule,
    ScheduleModule.forRoot(),
  ],
  providers: [
    SensorResolver,
    SensorService,
    SensorDataResolver,
    SensorResponseResolver,
  ],
  exports: [SensorService],
})
export class SensorModule {}
