import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class EsignageSchedulePublishPlayersLogs {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  logId: Types.ObjectId;

  @Prop()
  players: string[];
}
export type EsignageSchedulePublishPlayersLogsDocument =
  EsignageSchedulePublishPlayersLogs & Document;
export const EsignageSchedulePublishPlayersLogsSchema =
  SchemaFactory.createForClass(EsignageSchedulePublishPlayersLogs);
