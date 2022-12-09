import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class LanguageCode {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  languageCode: string;

  @Prop()
  status: number;

  @Prop()
  languageName: string;
}
export type LanguageCodeDocument = LanguageCode & Document;
export const LanguageCodeSchema = SchemaFactory.createForClass(LanguageCode);
