import { forwardRef, Module } from '@nestjs/common';
import { Device, DeviceSchema } from 'src/models/device';
import { Lamp, LampSchema } from 'src/models/lamp';
import { DeviceService } from './device.service';
import { DeviceResolver } from './device.resolver';
import { GroupModule } from '../group/group.module';
import { SensorModule } from '../sensor/sensor.module';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { UserModule } from '../user/user.module';
import { GoogleClientModule } from '../google-client/google-client/google-client.module';
import { PermissionModule } from '../permission/permission.module';
import { LampModule } from '../lamp/lamp.module';
import { LogModule } from '../log/log.module';
import { ElasticsearchSensorModule } from '../elasticsearch-sensor/elasticsearch-sensor.module';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Device.name,
        schema: DeviceSchema,
        collection: 'devices',
        discriminators: [{ name: Lamp.name, schema: LampSchema }],
      },
    ]),
    forwardRef(() => GroupModule),
    forwardRef(() => UserModule),
    forwardRef(() => SensorModule),
    forwardRef(() => LampModule),
    forwardRef(() => ElasticsearchSensorModule),
    ChtiotClientModule,
    GoogleClientModule,
    PermissionModule,
    LogModule,
  ],
  providers: [DeviceResolver, DeviceService],
  exports: [DeviceService],
})
export class DeviceModule {}
