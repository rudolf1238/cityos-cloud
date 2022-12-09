import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { EsignageTemplate } from './esignage.template';

@Schema({ timestamps: true })
export class EsignageTemplateLogs extends EsignageTemplate {
  @Prop()
  templateId: Types.ObjectId;

  @Prop()
  memo: string;

  @Prop()
  userId: Types.ObjectId;
}
export type EsignageTemplateLogsDocument = EsignageTemplateLogs & Document;
export const EsignageTemplateLogsSchema =
  SchemaFactory.createForClass(EsignageTemplateLogs);
