import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Int32 } from 'mongodb';

@Schema({ timestamps: true })
export class EmergencyCallEvents {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  userId: Types.ObjectId;

  @Prop()
  startTime: Date;

  @Prop()
  endTime: Date;

  @Prop()
  deviceId: Types.ObjectId;

  @Prop()
  ip: string;

  @Prop()
  status: Int32;
}
export type EmergencyCallEventsDocument = EmergencyCallEvents & Document;
export const EmergencyCallEventsSchema =
  SchemaFactory.createForClass(EmergencyCallEvents);
