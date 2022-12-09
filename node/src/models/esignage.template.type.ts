import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Int32 } from 'mongodb';

@Schema()
export class EsignageTemplateType {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  typeName: string;

  @Prop()
  resolutionId: string;

  @Prop()
  description: string;

  @Prop()
  templateImagePath_Light: string;

  @Prop()
  templateImagePath_Dark: string;

  @Prop()
  status: Int32;
}
export type EsignageTemplateTypeDocument = EsignageTemplateType & Document;
export const EsignageTemplateTypeSchema =
  SchemaFactory.createForClass(EsignageTemplateType);
