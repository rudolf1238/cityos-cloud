import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

@Schema({ timestamps: true })
export class EsignageIpcam {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  camName: string;

  @Prop()
  rtspUrl: string;

  @Prop()
  durations: number;
}
export type EsignageIpcamDocument = EsignageIpcam & Document;
export const EsignageIpcamSchema = SchemaFactory.createForClass(EsignageIpcam);
