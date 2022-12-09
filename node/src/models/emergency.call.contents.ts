import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class EmergencyCallContents {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  callId: Types.ObjectId;

  @Prop()
  textContent: string;

  @Prop()
  imageId: Types.ObjectId;
}
export type EmergencyCallContentsDocument = EmergencyCallContents & Document;
export const EmergencyCallContentsSchema = SchemaFactory.createForClass(
  EmergencyCallContents,
);
