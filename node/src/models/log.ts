import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Group } from './group';
import { User } from './user';

@Schema({ timestamps: true })
export class Log {
  _id: Types.ObjectId;

  id: string;

  constructor(
    user: User,
    event: UserEvent,
    groupId: string,
    ids: string[],
    result = '',
  ) {
    this.user = user;
    this.event = event;
    if (groupId !== '') {
      this.group = new Types.ObjectId(groupId);
    }
    this.ids = ids;
    this.result = result;
  }

  @Prop({ type: Types.ObjectId, ref: User.name, autopopulate: true })
  user: User;

  @Prop()
  event: UserEvent;

  @Prop({ type: Types.ObjectId, ref: Group.name, autopopulate: true })
  group?: Types.ObjectId | Group;

  @Prop({ type: [String] })
  ids: string[];

  @Prop()
  result: string;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type LogDocument = Log & Document;
export const LogSchema = SchemaFactory.createForClass(Log);

export enum UserEvent {
  ADD_DEVICE = 'ADD_DEVICE',
  ADD_GROUP = 'ADD_GROUP',
  ADD_USER = 'ADD_USER',
  ADD_MESSAGEBOARD = 'ADD_MESSAGEBOARD',
  REMOVE_DEVICE = 'REMOVE_DEVICE',
  RESTORE_DEVICE = 'RESTORE_DEVICE',
  REMOVE_GROUP = 'REMOVE_GROUP',
  REMOVE_USER = 'REMOVE_USER',
  MODIFY_DEVICE = 'MODIFY_DEVICE',
  MODIFT_GROUP = 'MODIFT_GROUP',
  MODIFY_USER = 'MODIFY_USER',
  MODIFY_SENSOR = 'MODIFY_SENSOR',
  UPDATE_SENSOR = 'UPDATE_SENSOR',
  REFRESH_TOKEN = 'REFRESH_TOKEN',
  ADD_WIFI_COMPANY = 'ADD_WIFI_COMPANY',
  ADD_WIFI_AREA = 'ADD_WIFI_AREA',
  ADD_WIFI_AD = 'ADD_WIFI_AD',
  REMOVE_WIFI_COMPANY = 'REMOVE_WIFI_COMPANY',
  REMOVE_WIFI_AREA = 'REMOVE_WIFI_AREA',
  REMOVE_WIFI_AD = 'REMOVE_WIFI_AD',
  MODIFY_WIFI_COMPANY = 'MODIFY_WIFI_COMPANY',
  MODIFY_WIFI_AREA = 'MODIFY_WIFI_AREA',
  MODIFY_WIFI_AD = 'MODIFY_WIFI_AD',
  LOG_OUT = 'LOG_OUT',
}
