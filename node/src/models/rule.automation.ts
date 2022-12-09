import { Document, Types } from 'mongoose';
import { AutomationAction } from './automation.action';
import { AutomationTrigger } from './automation.trigger';
import {
  Logic,
  RuleAutomation as ApolloRuleAutomation,
} from 'src/graphql.schema';
import { Group } from './group';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class EffectiveTime {
  @Prop()
  fromHour: number;

  @Prop()
  fromMinute: number;

  @Prop()
  toHour: number;

  @Prop()
  toMinute: number;
}

export const EffectiveTimeSchema = SchemaFactory.createForClass(EffectiveTime);

@Schema()
export class EffectiveDate {
  @Prop()
  startMonth: number;

  @Prop()
  startDay: number;

  @Prop()
  endMonth: number;

  @Prop()
  endDay: number;
}

export const EffectiveDateSchema = SchemaFactory.createForClass(EffectiveDate);

@Schema()
export class EffectiveAt {
  constructor() {
    const effectiveDate = new EffectiveDate();
    effectiveDate.startMonth = 1;
    effectiveDate.startDay = 1;
    effectiveDate.endMonth = 12;
    effectiveDate.endDay = 31;

    const effectiveTime = new EffectiveTime();
    effectiveTime.fromHour = 0;
    effectiveTime.fromMinute = 0;
    effectiveTime.toHour = 23;
    effectiveTime.toMinute = 59;

    this.timezone = 'Asia/Taipei';
    this.effectiveDate = effectiveDate;
    this.effectiveTime = effectiveTime;
    this.effectiveWeekday = [1, 2, 3, 4, 5, 6, 7];
  }

  @Prop()
  timezone: string;

  @Prop({ type: EffectiveDateSchema, _id: false })
  effectiveDate: EffectiveDate;

  @Prop()
  effectiveWeekday: number[];

  @Prop({ type: EffectiveTimeSchema, _id: false })
  effectiveTime: EffectiveTime;
}

export const EffectiveAtSchema = SchemaFactory.createForClass(EffectiveAt);

@Schema()
export class RuleAutomation {
  _id: Types.ObjectId;

  id: string;

  @Prop()
  name: string;

  @Prop({ type: Types.ObjectId, ref: Group.name, autopopulate: true })
  group: Group;

  @Prop({ type: EffectiveAtSchema, _id: false })
  effectiveAt: EffectiveAt;

  @Prop()
  logic: Logic;

  @Prop({
    type: [Types.ObjectId],
    ref: AutomationTrigger.name,
    autopopulate: true,
  })
  if: AutomationTrigger[] = [];

  @Prop({
    type: [Types.ObjectId],
    ref: AutomationAction.name,
    autopopulate: true,
  })
  then: AutomationAction[] = [];

  toApolloRuleAutomation: () => ApolloRuleAutomation;
}

export type RuleAutomationDocument = RuleAutomation & Document;
export const RuleAutomationSchema =
  SchemaFactory.createForClass(RuleAutomation);

RuleAutomationSchema.methods.toApolloRuleAutomation = function (
  this: RuleAutomation,
): ApolloRuleAutomation {
  const apolloRuleAutomation = new ApolloRuleAutomation();
  apolloRuleAutomation.id = this.id;
  apolloRuleAutomation.name = this.name;
  apolloRuleAutomation.group = this.group.toApolloGroup();
  apolloRuleAutomation.effectiveAt = this.effectiveAt;
  apolloRuleAutomation.logic = this.logic;
  apolloRuleAutomation.if = this.if.map((it) => it.toApolloAutomationTrigger());
  apolloRuleAutomation.then = this.then.map((it) =>
    it.toApolloAutomationAction(),
  );
  return apolloRuleAutomation;
};
