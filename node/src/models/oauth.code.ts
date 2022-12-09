import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OAuthClient } from './oauth.client';
import { User } from './user';

@Schema({ timestamps: true })
export class OAuthCode {
  _id: Types.ObjectId;

  id: string;

  @Prop({ type: Types.ObjectId, ref: User.name, autopopulate: false })
  user: User;

  @Prop({ type: Types.ObjectId, ref: OAuthClient.name, autopopulate: false })
  client: OAuthClient;

  @Prop()
  redirectUri: string;

  @Prop()
  authorizationCode: string;

  @Prop()
  expiresAt: Date;

  @Prop({ type: [String] })
  scope: string | string[];
}

export type OAuthCodeDocument = OAuthCode & Document;
export const OAuthCodeSchema = SchemaFactory.createForClass(OAuthCode);
