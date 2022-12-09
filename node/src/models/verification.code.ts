import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EmailType } from './email.type';
import { User } from './user';

@Schema({ timestamps: true })
export class VerificationCode {
  _id: Types.ObjectId;

  id: string;

  @Prop({ type: Types.ObjectId, ref: User.name, autopopulate: true })
  user: User;

  @Prop()
  code: string;

  @Prop()
  expiresAt: Date;

  @Prop()
  available: boolean;

  @Prop()
  type: EmailType;
}

export type VerificationCodeDocument = VerificationCode & Document;
export const VerificationCodeSchema =
  SchemaFactory.createForClass(VerificationCode);
