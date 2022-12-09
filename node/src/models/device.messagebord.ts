import { Document, Types } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { User } from './user';
import { MessageboardInput as Appboard } from 'src/graphql.schema';
import { ResponseMSG as ApolloResponseMSG } from 'src/graphql.schema';

const toApolloDevice = function (this: DeviceMessageboard): Appboard {
  const apolloDevice = new Appboard();
  apolloDevice.deviceId = this.deviceId;
  apolloDevice.content = this.content;
  apolloDevice.user = this.user.toString();
  apolloDevice.status = this.status;
  return apolloDevice;
};

const toApolloResponseMSG = function (
  this: DeviceMessageboard,
): ApolloResponseMSG {
  const apolloResponseMSG = new ApolloResponseMSG();
  apolloResponseMSG.id = this._id.toString();
  apolloResponseMSG.deviceId = this.deviceId;
  apolloResponseMSG.updatedAt = this.updatedAt;
  apolloResponseMSG.content = this.content;
  apolloResponseMSG.name = this.user[0].name;
  apolloResponseMSG.pictureId = this.pictureId;
  apolloResponseMSG.status = this.status;
  apolloResponseMSG.photo = this.user[0].photo;
  //apolloDevice.timezone = this.timezone;

  return apolloResponseMSG;
};
@Schema({ timestamps: true })
// @index({ location: '2dsphere' })
export class DeviceMessageboard {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  deviceId: string;

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

  toApolloResponseMSG: () => ApolloResponseMSG = toApolloResponseMSG;
}
export type DeviceMessageboardDocument = DeviceMessageboard & Document;
export const DeviceMessageboardSchema =
  SchemaFactory.createForClass(DeviceMessageboard);
DeviceMessageboardSchema.methods.toApolloResponseMSG = toApolloResponseMSG;
