import { Document, Types } from 'mongoose';
import { DeviceType, Logic, TriggerOperator } from 'src/graphql.schema';
import { Device } from './device';
import { AutomationTrigger as ApolloAutomationTrigger } from 'src/graphql.schema';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class Condition {
  @Prop()
  sensorId: string;

  @Prop()
  operator: TriggerOperator;

  @Prop()
  value: string;
}

export const ConditionSchema = SchemaFactory.createForClass(Condition);

@Schema()
export class AutomationTrigger {
  _id: Types.ObjectId;

  id: string;

  @Prop()
  deviceType: DeviceType;

  @Prop({ type: [Types.ObjectId], ref: Device.name, autopopulate: true })
  devices: Device[];

  @Prop()
  logic: Logic;

  @Prop({ type: [ConditionSchema], _id: false })
  conditions: Condition[];

  toApolloAutomationTrigger: () => ApolloAutomationTrigger;
}

export type AutomationTriggerDocument = AutomationTrigger & Document;
export const AutomationTriggerSchema =
  SchemaFactory.createForClass(AutomationTrigger);

AutomationTriggerSchema.methods.toApolloAutomationTrigger = function (
  this: AutomationTrigger,
): ApolloAutomationTrigger {
  const apolloAutomationTrigger = new ApolloAutomationTrigger();
  apolloAutomationTrigger.deviceType = this.deviceType;
  apolloAutomationTrigger.devices = this.devices.map((it) =>
    it.toApolloDevice(),
  );
  apolloAutomationTrigger.logic = this.logic;
  apolloAutomationTrigger.conditions = this.conditions;
  return apolloAutomationTrigger;
};
