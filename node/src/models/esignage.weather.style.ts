import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class EsignageWeatherStyle {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  style: string;

  @Prop()
  tag: string;

  @Prop()
  windSpeedUnit: string;

  @Prop()
  styleImage: string;

  @Prop()
  status: number;
}
export type EsignageWeatherStyleDocument = EsignageWeatherStyle & Document;
export const EsignageWeatherStyleSchema =
  SchemaFactory.createForClass(EsignageWeatherStyle);
