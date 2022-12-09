import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { RoleTemplate as ApolloRoleTemplate } from 'src/graphql.schema';
import { Permission } from './permission';

@Schema()
export class RoleTemplate {
  _id: Types.ObjectId;

  id: string;

  @Prop()
  name: string;

  @Prop({ type: Types.ObjectId, ref: Permission.name, autopopulate: true })
  permission: Permission;

  toApolloRoleTemplate: () => ApolloRoleTemplate;
}

export type RoleTemplateDocument = RoleTemplate & Document;
export const RoleTemplateSchema = SchemaFactory.createForClass(RoleTemplate);

RoleTemplateSchema.methods.toApolloRoleTemplate = function (
  this: RoleTemplate,
): ApolloRoleTemplate {
  const apolloRoleTemplate = new ApolloRoleTemplate();
  apolloRoleTemplate.id = this._id.toHexString();
  apolloRoleTemplate.name = this.name;
  apolloRoleTemplate.permission = this.permission;
  return apolloRoleTemplate;
};
