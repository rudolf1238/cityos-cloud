import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user';

@Schema({ timestamps: true })
export class DeviceToken {
  _id: Types.ObjectId;

  id: string;

  @Prop({ type: Types.ObjectId, ref: User.name, autopopulate: true })
  user: User;

  @Prop()
  deviceToken: string;
}

export type DeviceTokenDocument = DeviceToken & Document;
export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceToken);
