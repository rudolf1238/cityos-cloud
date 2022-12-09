import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class EsignageTemplateContentLogs {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  logId: Types.ObjectId;

  @Prop()
  templateId: Types.ObjectId;

  @Prop()
  contentTypeId: Types.ObjectId;

  @Prop()
  contentName: string;

  @Prop()
  tag: string;

  @Prop()
  x: number;

  @Prop()
  y: number;

  @Prop()
  width: number;

  @Prop()
  height: number;

  @Prop()
  rectId: string;
}
export type EsignageTemplateContentLogsDocument = EsignageTemplateContentLogs &
  Document;
export const EsignageTemplateContentLogsSchema = SchemaFactory.createForClass(
  EsignageTemplateContentLogs,
);
