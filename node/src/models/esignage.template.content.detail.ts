import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class EsignageTemplateContentDetail {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  contentId: Types.ObjectId;

  @Prop()
  mediaIds: Types.ObjectId[];

  @Prop()
  weatherId: Types.ObjectId;

  @Prop()
  webPageIds: Types.ObjectId[];

  @Prop()
  camIds: Types.ObjectId[];
}
export type EsignageTemplateContentDetailDocument =
  EsignageTemplateContentDetail & Document;
export const EsignageTemplateContentDetailSchema = SchemaFactory.createForClass(
  EsignageTemplateContentDetail,
);
