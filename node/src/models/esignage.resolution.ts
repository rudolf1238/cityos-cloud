import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Int32 } from 'mongodb';
@Schema()
export class EsignageResolution {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  name: string;

  @Prop()
  status: Int32;
}
export type EsignageResolutionDocument = EsignageResolution & Document;
export const EsignageResolutionSchema =
  SchemaFactory.createForClass(EsignageResolution);
