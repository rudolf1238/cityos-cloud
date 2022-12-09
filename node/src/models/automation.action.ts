import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  ActionType,
  AutomationAction as ApolloAutomationAction,
  NotifyAction as ApolloNotifyAction,
  DeviceAction as ApolloDeviceAction,
  DeviceType,
} from 'src/graphql.schema';
import { Device } from './device';
import { User } from './user';

@Schema()
export class AutomationAction {
  _id: Types.ObjectId;

  id: string;

  @Prop()
  actionType: ActionType;

  toApolloAutomationAction: () => ApolloAutomationAction;
}

export const AutomationActionSchema =
  SchemaFactory.createForClass(AutomationAction);

AutomationActionSchema.methods.toApolloAutomationAction = function (
  this: AutomationAction,
): ApolloAutomationAction {
  switch (this.actionType) {
    case ActionType.NOTIFY: {
      const notifyAction = this as unknown as NotifyAction;
      return notifyAction.toApolloNotifyAction();
    }
    case ActionType.DEVICE: {
      const deviceAction = this as unknown as DeviceAction;
      return deviceAction.toApolloDeviceAction();
    }
  }
};

@Schema()
export class NotifyAction extends AutomationAction {
  @Prop({ type: [Types.ObjectId], ref: User.name, autopopulate: true })
  users: User[];

  @Prop()
  message: string;

  @Prop()
  snapshot: boolean;

  toApolloNotifyAction: () => ApolloNotifyAction;
}

export type NotifyActionDocument = NotifyAction & Document;
export const NotifyActionSchema = SchemaFactory.createForClass(NotifyAction);

NotifyActionSchema.methods.toApolloNotifyAction = function (
  this: NotifyAction,
): ApolloNotifyAction {
  const apolloNotifyAction = new ApolloNotifyAction();
  apolloNotifyAction.actionType = ActionType.NOTIFY;
  apolloNotifyAction.users = this.users.map((it) => it.toApolloUser());
  apolloNotifyAction.message = this.message;
  apolloNotifyAction.snapshot = this.snapshot;
  return apolloNotifyAction;
};

@Schema()
export class DeviceAction extends AutomationAction {
  @Prop()
  deviceType: DeviceType;

  @Prop({ type: [Types.ObjectId], ref: Device.name, autopopulate: true })
  devices: Device[];

  @Prop()
  sensorId: string;

  @Prop()
  setValue: string;

  toApolloDeviceAction: () => ApolloDeviceAction;
}

export type DeviceActionDocument = DeviceAction & Document;
export const DeviceActionSchema = SchemaFactory.createForClass(DeviceAction);

DeviceActionSchema.methods.toApolloDeviceAction = function (
  this: DeviceAction,
): ApolloDeviceAction {
  const apolloDeviceAction = new ApolloDeviceAction();
  apolloDeviceAction.actionType = ActionType.DEVICE;
  apolloDeviceAction.deviceType = this.deviceType;
  apolloDeviceAction.devices = this.devices.map((it) => it.toApolloDevice());
  apolloDeviceAction.sensorId = this.sensorId;
  apolloDeviceAction.setValue = this.setValue;
  return apolloDeviceAction;
};
