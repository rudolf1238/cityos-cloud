import { Document, Types } from 'mongoose';
import {
  DeviceAction,
  DeviceActionSchema,
  NotifyAction,
  NotifyActionSchema,
} from './automation.action';
import { RuleAuditLog as ApolloRuleAuditLog } from 'src/graphql.schema';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Group } from './group';

@Schema({ timestamps: true })
export class RuleAuditLog {
  _id: Types.ObjectId;

  id: string;

  @Prop({ type: Types.ObjectId })
  ruleId: string;

  @Prop()
  ruleName: string;

  @Prop({ type: Types.ObjectId, ref: Group.name, autopopulate: true })
  group: Group;

  @Prop()
  triggeredTime: Date;

  @Prop()
  triggeredExpression: string;

  @Prop()
  triggeredCurrentValue: string;

  @Prop({ type: [NotifyActionSchema], _id: false })
  notifyActions: NotifyAction[] = [];

  @Prop({ type: [DeviceActionSchema], _id: false })
  deviceActions: DeviceAction[] = [];

  toApolloRuleAuditLog: () => ApolloRuleAuditLog;
}

export type RuleAuditLogDocument = RuleAuditLog & Document;
export const RuleAuditLogSchema = SchemaFactory.createForClass(RuleAuditLog);

RuleAuditLogSchema.methods.toApolloRuleAuditLog = function (
  this: RuleAuditLog,
): ApolloRuleAuditLog {
  const apolloRuleAuditLog = new ApolloRuleAuditLog();
  apolloRuleAuditLog.ruleId = this.ruleId;
  apolloRuleAuditLog.ruleName = this.ruleName;
  apolloRuleAuditLog.group = this.group.toApolloGroup();
  apolloRuleAuditLog.triggeredTime = this.triggeredTime;
  apolloRuleAuditLog.triggeredExpression = this.triggeredExpression;
  apolloRuleAuditLog.triggeredCurrentValue = this.triggeredCurrentValue;
  apolloRuleAuditLog.notifyActions = this.notifyActions?.map((it) =>
    it.toApolloNotifyAction(),
  );
  apolloRuleAuditLog.deviceActions = this.deviceActions?.map((it) =>
    it.toApolloDeviceAction(),
  );
  return apolloRuleAuditLog;
};
