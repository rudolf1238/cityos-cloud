import { forwardRef, Module } from '@nestjs/common';
import { Lamp, LampSchema } from 'src/models/lamp';
import { LampService } from './lamp.service';
import { LampResolver } from './lamp.resolver';
import { DeviceModule } from '../device/device.module';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { PermissionModule } from '../permission/permission.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Device, DeviceSchema } from 'src/models/device';

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
    ChtiotClientModule,
    PermissionModule,
    forwardRef(() => DeviceModule),
  ],
  providers: [LampResolver, LampService],
  exports: [LampService],
})
export class LampModule {}
