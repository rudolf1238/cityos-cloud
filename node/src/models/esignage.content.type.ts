import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class EsignageContentType {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  typeName: string;

  @Prop()
  description: string;

  @Prop()
  status: number;
}
export type EsignageContentTypeDocument = EsignageContentType & Document;
export const EsignageContentTypeSchema =
  SchemaFactory.createForClass(EsignageContentType);
