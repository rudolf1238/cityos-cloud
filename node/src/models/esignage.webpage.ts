import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class EsignageWebpage {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  webUrl: string;

  @Prop()
  playTime: number;
}
export type EsignageWebpageDocument = EsignageWebpage & Document;
export const EsignageWebpageSchema =
  SchemaFactory.createForClass(EsignageWebpage);
