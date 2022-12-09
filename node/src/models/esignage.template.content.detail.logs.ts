import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class EsignageTemplateContentDetailLogs {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  logsId: Types.ObjectId;

  @Prop()
  contentId: Types.ObjectId;

  @Prop()
  mediaIds: Types.ObjectId[];

  @Prop()
  weatherId: Types.ObjectId;

  @Prop()
  webPageIds: Types.ObjectId[];

  @Prop()
  camIds: Types.ObjectId[];
}
export type EsignageTemplateContentDetailLogsDocument =
  EsignageTemplateContentDetailLogs & Document;
export const EsignageTemplateContentDetailLogsSchema =
  SchemaFactory.createForClass(EsignageTemplateContentDetailLogs);
