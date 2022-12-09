import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { DeviceStatus } from 'src/graphql.schema';
import { Device } from './device';
import { Document } from 'mongoose';

@Schema()
export class Notification extends Device {
  @Prop()
  projectKey: string[];
}
export const NotificationSchema = SchemaFactory.createForClass(Notification);

@Schema({ timestamps: true })
export class DeviceStatusInfo {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  deviceId: string;

  @Prop()
  status?: DeviceStatus;

  @Prop()
  previousStatus?: DeviceStatus;

  @Prop()
  groupsLength: number;

  @Prop()
  createdAt: Date;
}

export const DeviceStatusInfoSchema =
  SchemaFactory.createForClass(DeviceStatusInfo);

@Schema({ timestamps: true })
export class DeviceStatusInfoLogs {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  _deviceOId: Types.ObjectId;

  @Prop()
  deviceId: string;

  @Prop()
  status?: string;

  @Prop()
  previousStatus?: string;

  @Prop()
  groupsLength: number;

  @Prop()
  createdAt: Date;

  @Prop()
  LogDateTime: Date;
}

export const DeviceStatusInfoLogsSchema =
  SchemaFactory.createForClass(DeviceStatusInfoLogs);

@Schema({ timestamps: true })
export class EmailNotificationLogs {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  deviceId: string;

  @Prop()
  name: string;

  @Prop()
  userName: string;

  @Prop()
  previousStatus: string;

  @Prop()
  currentStatus: string;

  @Prop()
  email: string;

  @Prop()
  emailTitle: string;

  @Prop()
  emailContent: string;

  @Prop()
  createdAt: Date;
}

export const EmailNotificationLogsSchema = SchemaFactory.createForClass(
  EmailNotificationLogs,
);

@Schema()
export class SendList {
  @Prop()
  deviceId: string;

  @Prop()
  devcieName: string;

  @Prop()
  devicePreviousStatus: string;

  @Prop()
  userName: string;

  @Prop()
  email: string;

  @Prop()
  lineId: string;

  @Prop()
  phone: string;

  @Prop()
  emailTitle: string;

  @Prop()
  emailContent: string;

  @Prop()
  language: string;
}

export type NotificationDocument = Notification & Document;
export type DeviceStatusInfoDocument = DeviceStatusInfo & Document;
export type DeviceStatusInfoLogsDocument = DeviceStatusInfoLogs & Document;
export type EmailNotificationLogsDocument = EmailNotificationLogs & Document;
export type SendListDocument = SendList & Document;
export const SendListSchema = SchemaFactory.createForClass(SendList);
