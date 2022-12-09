import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class OAuthClient {
  _id: Types.ObjectId;

  id: string;

  @Prop()
  clientId: string;

  @Prop()
  clientSecret: string;

  @Prop({ type: [String] })
  redirectUris: string[];

  @Prop({ type: [String] })
  grants: string[];
}

export type OAuthClientDocument = OAuthClient & Document;
export const OAuthClientSchema = SchemaFactory.createForClass(OAuthClient);
