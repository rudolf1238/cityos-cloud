import { forwardRef, Module } from '@nestjs/common';
import {
  DeviceStatusInfoLogs,
  DeviceStatusInfo,
  EmailNotificationLogs,
  Notification,
  SendList,
  NotificationSchema,
  SendListSchema,
  DeviceStatusInfoLogsSchema,
  EmailNotificationLogsSchema,
} from 'src/models/notification';
import { Device, DeviceSchema } from 'src/models/device';
import { NotificationResolver } from './notification.resolver';
import { NotificationService } from './notification.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { GroupModule } from '../group/group.module';
import { UserModule } from '../user/user.module';
import { DeviceModule } from '../device/device.module';
import { SensorModule } from '../sensor/sensor.module';
import { PermissionModule } from '../permission/permission.module';
import { LogModule } from '../log/log.module';
// import { Lamp, LampSchema } from 'src/models/lamp';
// import { LampModule } from '../lamp/lamp.module';
import { ConfigModule } from '@nestjs/config';
import { MailModule } from '../mail/mail.module';
//import { ProducerModule } from './producer/producer.module';
import { DeviceStatusInfoSchema } from '../../models/notification';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Notification.name,
        schema: NotificationSchema,
        collection: 'devices',
        //timestamps: true,
        // discriminators: [{ name: Lamp.name, schema: LampSchema }],
      },
      {
        name: Device.name,
        schema: DeviceSchema,
        collection: 'devices',
        //timestamps: true,
        // discriminators: [{ name: Lamp.name, schema: LampSchema }],
      },
      {
        name: SendList.name,
        schema: SendListSchema,
        collection: 'malfunctioning_device_notify_type',
        //timestamps: true,
      },
      {
        name: DeviceStatusInfo.name,
        schema: DeviceStatusInfoSchema,
        collection: 'device_status',
        //timestamps: true,
      },
      {
        name: DeviceStatusInfoLogs.name,
        schema: DeviceStatusInfoLogsSchema,
        collection: 'device_status_logs',
        //timestamps: true,
      },
      {
        name: EmailNotificationLogs.name,
        schema: EmailNotificationLogsSchema,
        collection: 'email_notification_logs',
        //timestamps: true,
      },
    ]),
    //forwardRef(() => NotificationModule),
    forwardRef(() => GroupModule),
    forwardRef(() => UserModule),
    forwardRef(() => DeviceModule),
    forwardRef(() => SensorModule),
    //forwardRef(() => LampModule),
    ChtiotClientModule,
    PermissionModule,
    ConfigModule,
    LogModule,
    MailModule,
    //ProducerModule,
  ],
  providers: [NotificationResolver, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
