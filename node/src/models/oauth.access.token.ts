import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { OAuthClient } from './oauth.client';
import { User } from './user';

@Schema({ timestamps: true })
export class OAuthAccessToken {
  _id: Types.ObjectId;

  id: string;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    autopopulate: true,
  })
  user: User;

  @Prop()
  accessToken: string;

  @Prop({ type: Types.ObjectId, ref: OAuthClient.name, autopopulate: true })
  client: OAuthClient;

  @Prop()
  accessTokenExpiresAt: Date;

  @Prop()
  refreshToken: string;

  @Prop()
  refreshTokenExpiresAt: Date;

  @Prop({ type: [String] })
  scope: string | string[];

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export type OAuthAccessTokenDocument = OAuthAccessToken & Document;
export const OAuthAccessTokenSchema =
  SchemaFactory.createForClass(OAuthAccessToken);
