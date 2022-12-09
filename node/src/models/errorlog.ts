import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Group } from './group';
import { User } from './user';

@Schema({ timestamps: true })
export class ErrorLog {
  _id: Types.ObjectId;

  id: string;

  @Prop({ type: Types.ObjectId, ref: User.name, autopopulate: true })
  user: User;

  @Prop()
  event: ErrorEvent;

  @Prop({ type: Types.ObjectId, ref: Group.name, autopopulate: true })
  group?: Types.ObjectId | Group;

  @Prop()
  result: string;
}

export type ErrorLogDocument = ErrorLog & Document;
export const ErrorLogSchema = SchemaFactory.createForClass(ErrorLog);

export enum ErrorEvent {
  TRANSACTION_CREATE_ERROR = 'TRANSACTION_CREATE_ERROR',
  TRANSACTION_CUPDATE_ERROR = 'TRANSACTION_UPDATE_ERROR',
  IOT_UPDATE_ERROR = 'IOT_UPDATE_ERROR',
  IOT_CREATE_ERROR = 'IOT_CREATE_ERROR',
}
