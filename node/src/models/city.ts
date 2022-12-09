import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, Document } from 'mongoose';

@Schema()
export class City {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  cityName: string;

  @Prop()
  region: string;

  @Prop()
  status: number;
}
export type CityDocument = City & Document;
export const CitySchema = SchemaFactory.createForClass(City);
