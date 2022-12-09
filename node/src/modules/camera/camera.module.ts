import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CameraService } from './camera.service';
import { CameraEventResolver, CameraResolver } from './camera.resolver';
import { DeviceModule } from '../device/device.module';
import { PermissionModule } from '../permission/permission.module';
import { LiveView, LiveViewSchema } from 'src/models/liveview';
import { GroupModule } from '../group/group.module';
import { ElasticsearchSensorModule } from '../elasticsearch-sensor/elasticsearch-sensor.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: LiveView.name,
        schema: LiveViewSchema,
        collection: 'liveview',
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
    DeviceModule,
    DeviceModule,
    PermissionModule,
    GroupModule,
    ElasticsearchSensorModule,
  ],
  providers: [CameraResolver, CameraEventResolver, CameraService],
})
export class CameraModule {}
