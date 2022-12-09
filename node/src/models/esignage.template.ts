import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class EsignageTemplate {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  name: string;

  @Prop()
  templateTypeId: Types.ObjectId;

  @Prop()
  description: string;

  @Prop()
  backgroundColor: string;

  @Prop()
  group: Types.ObjectId;

  @Prop()
  status: number;
}
export type EsignageTemplateDocument = EsignageTemplate & Document;
export const EsignageTemplateSchema =
  SchemaFactory.createForClass(EsignageTemplate);
