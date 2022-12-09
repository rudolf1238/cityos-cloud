import { MaintenanceStaffService } from './maintenance_staff.service';
import { MaintenanceStaffResolver } from './maintenance_staff.resolver';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GoogleClientModule } from '../google-client/google-client/google-client.module';
import { PermissionModule } from '../permission/permission.module';
import { LogModule } from '../log/log.module';
import {
  MaintenanceStaff,
  MaintenanceStaffSchema,
} from 'src/models/maintenance_staff';
import { GroupModule } from '../group/group.module';
import { UserModule } from '../user/user.module';
import { DeviceModule } from '../device/device.module';
import { User, UserSchema } from 'src/models/user';
import { Device, DeviceSchema } from 'src/models/device';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: MaintenanceStaff.name,
        schema: MaintenanceStaffSchema,
        collection: 'maintenance_devicelist',
      },
      {
        name: User.name,
        schema: UserSchema,
        collection: 'users',
      },
      {
        name: Device.name,
        schema: DeviceSchema,
        collection: 'devices',
        // discriminators: [{ name: Lamp.name, schema: LampSchema }],
      },
    ]),
    forwardRef(() => GroupModule),
    forwardRef(() => DeviceModule),
    forwardRef(() => UserModule),
    GoogleClientModule,
    PermissionModule,
    LogModule,
  ],
  providers: [MaintenanceStaffResolver, MaintenanceStaffService],
  exports: [MaintenanceStaffService],
})
export class MaintenanceStaffModule {}
