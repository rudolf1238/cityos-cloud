import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class EsignageWeather {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  weatherStyleId: Types.ObjectId;

  @Prop()
  temperatureUnit: string;

  @Prop()
  windSpeedUnit: string;

  @Prop()
  languageId: Types.ObjectId;

  @Prop()
  backgroundColor: string;

  @Prop()
  durations: number;

  @Prop()
  citys: string[];
}
export type EsignageWeatherDocument = EsignageWeather & Document;
export const EsignageWeatherSchema =
  SchemaFactory.createForClass(EsignageWeather);
