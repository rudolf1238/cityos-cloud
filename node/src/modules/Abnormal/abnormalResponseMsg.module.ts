import { AbnormalResponseMsgService } from './abnormalResponseMsg.service';
import { AbnormalResponseMsgResolver } from './abnormalResponseMsg.resolver';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GoogleClientModule } from '../google-client/google-client/google-client.module';
import { PermissionModule } from '../permission/permission.module';
import { LogModule } from '../log/log.module';
import {
  DeviceMessageboard,
  DeviceMessageboardSchema,
} from 'src/models/device.messagebord';
import {
  DeviceMessageboardSon,
  DeviceMessageboardSonSchema,
} from 'src/models/device.messagebordSon';
import {
  MaintenanceStaff,
  MaintenanceStaffSchema,
} from 'src/models/maintenance_staff';
import { GroupModule } from '../group/group.module';
import { UserModule } from '../user/user.module';
import { DeviceModule } from '../device/device.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: DeviceMessageboard.name,
        schema: DeviceMessageboardSchema,
        collection: 'device_messageboard',
      },
      {
        name: DeviceMessageboardSon.name,
        schema: DeviceMessageboardSonSchema,
        collection: 'device_messageboard_son',
      },
      {
        name: MaintenanceStaff.name,
        schema: MaintenanceStaffSchema,
        collection: 'maintenance_devicelist',
        // discriminators: [],
      },
    ]),
    forwardRef(() => GroupModule),
    forwardRef(() => UserModule),
    DeviceModule,
    GoogleClientModule,
    PermissionModule,
    LogModule,
  ],
  providers: [AbnormalResponseMsgResolver, AbnormalResponseMsgService],
  exports: [AbnormalResponseMsgService],
})
export class AbnormalResponseMsgModule {}
