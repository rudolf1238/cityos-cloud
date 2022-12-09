import { Types, Document } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { MessageboardInputSon as Appboard } from 'src/graphql.schema';
import { UpdateMessageboardInput as ApolloUpdateMSG } from 'src/graphql.schema';

// import { MessageboardInputSon as Appboard } from 'src/graphql.schema';
import { ResponseMSG_Son as ApolloResponseMSG_Son } from 'src/graphql.schema';
import { User } from './user';

const toApolloDevice = function (this: DeviceMessageboardSon): Appboard {
  const apolloDevice = new Appboard();
  apolloDevice.deviceId = this.deviceId;
  apolloDevice.msgId = this.msgId;
  apolloDevice.content = this.content;
  apolloDevice.user = this.user.toString();
  apolloDevice.status = this.status;
  return apolloDevice;
};
const toApolloResponseMSGSon = function (
  this: DeviceMessageboardSon,
): ApolloResponseMSG_Son {
  const apolloResponseMSGSon = new ApolloResponseMSG_Son();
  apolloResponseMSGSon.msgId = this.msgId;
  apolloResponseMSGSon.updatedAt = this.updatedAt;
  apolloResponseMSGSon.content = this.content;
  apolloResponseMSGSon.name = this.user[0].name;
  apolloResponseMSGSon.id = this._id.toString();
  apolloResponseMSGSon.pictureId = this.pictureId;
  apolloResponseMSGSon.status = this.status;
  apolloResponseMSGSon.photo = this.user[0].photo;
  //apolloDevice.timezone = this.timezone;

  return apolloResponseMSGSon;
};
const toApolloUpdateMSG = function (
  this: DeviceMessageboardSon,
): ApolloUpdateMSG {
  const apolloUpdateMSG = new ApolloUpdateMSG();
  apolloUpdateMSG.deviceId = this.deviceId;
  apolloUpdateMSG.id = this.id;
  apolloUpdateMSG.content = this.content;
  apolloUpdateMSG.user = this.user.toString();
  apolloUpdateMSG.status = this.status;
  return apolloUpdateMSG;
};
@Schema({ timestamps: true })
// @index({ location: '2dsphere' })
export class DeviceMessageboardSon {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  deviceId: string;

  @Prop()
  msgId: string;

  @Prop()
  content: string;

  @Prop({ ref: () => User })
  user: User[];

  @Prop()
  status: string;

  @Prop()
  updatedAt: Date;

  @Prop()
  pictureId: string;

  toApolloDevice: () => Appboard = toApolloDevice;

  toApolloResponseMSGSon: () => ApolloResponseMSG_Son = toApolloResponseMSGSon;

  toApolloUpdateMSG: () => ApolloUpdateMSG = toApolloUpdateMSG;
}
export type DeviceMessageboardSonDocument = DeviceMessageboardSon & Document;
export const DeviceMessageboardSonSchema = SchemaFactory.createForClass(
  DeviceMessageboardSon,
);
DeviceMessageboardSonSchema.methods.toApolloResponseMSGSon =
  toApolloResponseMSGSon;

export const ApolloUpdateMSGSchema = SchemaFactory.createForClass(
  DeviceMessageboardSon,
);
