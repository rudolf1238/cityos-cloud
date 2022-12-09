import { forwardRef, Module } from '@nestjs/common';
import { MalDevice, MalDeviceSchema } from 'src/models/maldevice';
import { MongooseModule } from '@nestjs/mongoose';
import { MaldeviceService } from './maldevice.service';
import { MaldeviceResolver } from './maldevice.resolver';
import { GoogleClientModule } from '../google-client/google-client/google-client.module';
import { LogModule } from '../log/log.module';
import { GroupModule } from '../group/group.module';
import { UserModule } from '../user/user.module';
import { PermissionModule } from '../permission/permission.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: MalDevice.name,
        schema: MalDeviceSchema,
        collection: 'malfunctioning_device_notify_type',
        //timestamps: true,
      },
    ]),
    forwardRef(() => GroupModule),
    forwardRef(() => UserModule),
    GoogleClientModule,
    PermissionModule,
    LogModule,
  ],
  providers: [MaldeviceResolver, MaldeviceService],
  exports: [MaldeviceService],
})
export class MalDeviceModule {}
