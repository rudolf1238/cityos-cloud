import {
  LiveViewConfig as ApolloLiveViewConfig,
  SplitMode,
} from 'src/graphql.schema';
import { Document, Types } from 'mongoose';
import { User } from './user';
import { Group } from './group';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class LiveViewDevice {
  @Prop()
  deviceId: string;

  @Prop({ type: Number, default: null })
  fixedIndex?: number = null;
}

export const LiveViewDeviceSchema =
  SchemaFactory.createForClass(LiveViewDevice);

@Schema()
export class LiveViewConfig {
  @Prop({ type: [LiveViewDeviceSchema], default: [], _id: false })
  devices: LiveViewDevice[] = [];

  @Prop({ default: SplitMode.NINE })
  splitMode: SplitMode = SplitMode.NINE;

  @Prop({ type: Boolean, default: true })
  autoplay = true;

  @Prop({ type: Number, default: 60 })
  autoplayInSeconds = 60;

  toApolloLiveViewConfig: () => ApolloLiveViewConfig;
}

export const LiveViewConfigSchema =
  SchemaFactory.createForClass(LiveViewConfig);

LiveViewConfigSchema.methods.toApolloLiveViewConfig = function (
  this: LiveViewConfig,
): ApolloLiveViewConfig {
  const apolloLiveViewConfig = new ApolloLiveViewConfig();
  apolloLiveViewConfig.devices = this.devices;
  apolloLiveViewConfig.splitMode = this.splitMode;
  apolloLiveViewConfig.autoplay = this.autoplay;
  apolloLiveViewConfig.autoplayInSeconds = this.autoplayInSeconds;
  return apolloLiveViewConfig;
};

@Schema()
export class LiveView {
  _id: Types.ObjectId;

  id: string;

  @Prop({ type: Types.ObjectId, ref: User.name, autopopulate: true })
  user: User;

  @Prop({ type: Types.ObjectId, ref: Group.name, autopopulate: true })
  group: Group;

  @Prop({ type: LiveViewConfigSchema, _id: false })
  config: LiveViewConfig;
}

export type LiveViewDocument = LiveView & Document;
export const LiveViewSchema = SchemaFactory.createForClass(LiveView);
