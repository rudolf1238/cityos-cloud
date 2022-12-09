import { Document, Types } from 'mongoose';
import { RuleAutomation } from './rule.automation';
import { User } from './user';
import { RuleSubscription as ApolloRuleSubscription } from 'src/graphql.schema';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema()
export class RuleSubscription {
  _id: Types.ObjectId;

  id: string;

  @Prop({ type: Types.ObjectId, ref: User.name, autopopulate: true })
  user: User;

  @Prop({ type: Types.ObjectId, ref: RuleAutomation.name, autopopulate: true })
  rule: RuleAutomation;

  @Prop()
  byLine: boolean;

  @Prop()
  byMail: boolean;

  toApolloRuleSubscription: () => ApolloRuleSubscription;
}

export type RuleSubscriptionDocument = RuleSubscription & Document;
export const RuleSubscriptionSchema =
  SchemaFactory.createForClass(RuleSubscription);

RuleSubscriptionSchema.methods.toApolloRuleSubscription = function (
  this: RuleSubscription,
): ApolloRuleSubscription {
  const apolloRuleSubscription = new ApolloRuleSubscription();
  apolloRuleSubscription.rule = this.rule.toApolloRuleAutomation();
  apolloRuleSubscription.byLine = this.byLine;
  apolloRuleSubscription.byMail = this.byMail;
  return apolloRuleSubscription;
};
