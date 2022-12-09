import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

@Schema({ timestamps: true })
export class EsignageMediaPool {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  mediaId: Types.ObjectId;

  @Prop()
  userId: Types.ObjectId;

  @Prop()
  templateId: Types.ObjectId;

  @Prop()
  imagePlayDurations: number;
}
export type EsignageMediaPoolDocument = EsignageMediaPool & Document;
export const EsignageMediaPoolSchema =
  SchemaFactory.createForClass(EsignageMediaPool);
