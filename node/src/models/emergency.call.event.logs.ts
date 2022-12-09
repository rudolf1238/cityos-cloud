import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Int32 } from 'mongodb';

@Schema({ timestamps: true })
export class EmergencyCallEventLogs {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  eventId: Types.ObjectId;

  @Prop()
  status: Int32;
}
export type EmergencyCallEventLogsDocument = EmergencyCallEventLogs & Document;
export const EmergencyCallEventLogsSchema = SchemaFactory.createForClass(
  EmergencyCallEventLogs,
);
