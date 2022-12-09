import { DashboardConfig as ApolloDashboardConfig } from 'src/graphql.schema';
import { Document, Types } from 'mongoose';
import { User } from './user';
import { Group } from './group';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class DashboardConfig {
  @Prop()
  index: number;

  @Prop()
  config: string;

  toApolloDashboardConfig: () => ApolloDashboardConfig;
}

export const DashboardConfigSchema =
  SchemaFactory.createForClass(DashboardConfig);

DashboardConfigSchema.methods.toApolloDashboardConfig = function (
  this: DashboardConfig,
): ApolloDashboardConfig {
  const apolloDashboardConfig = new ApolloDashboardConfig();
  apolloDashboardConfig.index = this.index;
  apolloDashboardConfig.config = this.config;
  return apolloDashboardConfig;
};

@Schema()
export class Dashboard {
  _id: Types.ObjectId;

  id: string;

  @Prop({ type: Types.ObjectId, ref: User.name, autopopulate: true })
  user: User;

  @Prop({ type: Types.ObjectId, ref: Group.name, autopopulate: true })
  group: Group;

  @Prop({ type: [DashboardConfigSchema], _id: false })
  configs: DashboardConfig[] = [];
}

export type DashboardDocument = Dashboard & Document;
export const DashboardSchema = SchemaFactory.createForClass(Dashboard);
