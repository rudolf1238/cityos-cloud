import {
  DeviceType,
  Group as ApolloGroup,
  SensorMask as ApolloSensorMask,
} from 'src/graphql.schema';
import { Document, Types } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class SensorMaskInfo {
  @Prop()
  deviceType: DeviceType;

  @Prop()
  sensorId: string;
}

export const SensorMaskInfoSchema =
  SchemaFactory.createForClass(SensorMaskInfo);

@Schema()
export class SensorMask {
  @Prop({ type: Boolean })
  enable = false;

  @Prop({ type: [SensorMaskInfoSchema], _id: false })
  sensors: SensorMaskInfo[] = [];

  toApolloSensorMask: () => ApolloSensorMask;
}

export const SensorMaskSchema = SchemaFactory.createForClass(SensorMask);

SensorMaskSchema.methods.toApolloSensorMask = function (
  this: SensorMask,
): ApolloSensorMask {
  const apolloSensorMask = new ApolloSensorMask();
  apolloSensorMask.enable = this.enable;
  apolloSensorMask.sensors = this.sensors;
  return apolloSensorMask;
};

@Schema({ timestamps: true })
export class Group {
  _id: Types.ObjectId;

  id: string;

  @Prop()
  name: string;

  @Prop({ type: Types.ObjectId })
  parent?: Types.ObjectId;

  @Prop({ type: [Types.ObjectId] })
  ancestors: Types.ObjectId[] = [];

  @Prop()
  projectKey?: string;

  @Prop({ type: SensorMaskSchema, _id: false })
  sensorMask?: SensorMask;

  @Prop()
  projectId?: string;

  @Prop()
  companyId?: string;

  @Prop()
  logo?: string;

  @Prop()
  line?: string;

  @Prop()
  url?: string;

  toApolloGroup: () => ApolloGroup;
}
export type GroupDocument = Group & Document;
export const GroupSchema = SchemaFactory.createForClass(Group);

GroupSchema.methods.toApolloGroup = function (this: Group) {
  const apolloGroup = new ApolloGroup();
  apolloGroup.id = this._id.toHexString();
  apolloGroup.name = this.name;
  apolloGroup.ancestors = this.ancestors.flatMap((it) => it.toString());
  apolloGroup.projectKey = this.projectKey;
  apolloGroup.sensorMask = this.sensorMask?.toApolloSensorMask();
  apolloGroup.companyId = this.companyId;
  apolloGroup.logo = this.logo;
  apolloGroup.line = this.line;
  apolloGroup.url = this.url;
  return apolloGroup;
};

@Schema()
export class DisabledGroup {
  @Prop({ ref: () => Group })
  ids: Group;

  @Prop()
  disabledAt: Date;
}
export const DisabledGroupSchema = SchemaFactory.createForClass(DisabledGroup);
