import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { Document } from 'mongoose';
import {
  DeviceType,
  NotifyType,
  MalDevice as ApplloMalDevice,
} from 'src/graphql.schema';

const toApolloMalDevice = function (this: MalDevice): ApplloMalDevice {
  const apolloMalDevice = new ApplloMalDevice();

  apolloMalDevice.name = this.name;
  apolloMalDevice.status = this.status;
  apolloMalDevice.deviceType = this.deviceType;
  apolloMalDevice.notifyType = this.notifyType;
  apolloMalDevice.division_id = this.division_id.flatMap((it) =>
    it.toHexString(),
  );

  return apolloMalDevice;
};

@Schema({ timestamps: true })
export class MalDevice {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  name: string;

  @Prop()
  deviceType: DeviceType[];

  @Prop()
  notifyType: NotifyType[];

  @Prop()
  status: string;

  @Prop({ generated: false, type: Types.ObjectId })
  division_id: Types.ObjectId[] = [];

  toApolloMalDevice: () => ApplloMalDevice = toApolloMalDevice;
}

export type MalDeviceDocument = MalDevice & Document;
export const MalDeviceSchema = SchemaFactory.createForClass(MalDevice);

MalDeviceSchema.methods.toApolloMalDevice = toApolloMalDevice;
