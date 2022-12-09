import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  Action,
  Permission as ApolloPermission,
  Subject,
  Rule as ApolloRule,
} from 'src/graphql.schema';

@Schema()
export class Rule {
  @Prop()
  action: Action;

  @Prop()
  subject: Subject;

  toApolloRule(): ApolloRule {
    const rule = new ApolloRule();
    rule.action = this.action;
    rule.subject = this.subject;
    return rule;
  }
}

export const RuleSchema = SchemaFactory.createForClass(Rule);

@Schema()
export class Permission {
  _id!: Types.ObjectId;

  id: string;

  @Prop({ type: [RuleSchema], _id: false })
  rules: Rule[] = [];

  toApolloPermission: () => ApolloPermission;
}

export type PermissionDocument = Permission & Document;
export const PermissionSchema = SchemaFactory.createForClass(Permission);

PermissionSchema.methods.toApolloPermission = function (
  this: Permission,
): ApolloPermission {
  const permission = new ApolloPermission();
  permission.rules = this.rules;
  return permission;
};
