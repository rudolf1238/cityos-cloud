import { Prop, SchemaFactory, Schema } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  Language,
  User as ApolloUser,
  GroupInfo as ApolloGroupInfo,
  Theme,
  UserStatus,
} from 'src/graphql.schema';
import { Group } from './group';
import { Permission } from './permission';

@Schema()
export class GroupInfo {
  @Prop()
  inUse: boolean;

  @Prop({ type: Types.ObjectId, ref: Group.name, autopopulate: true })
  group: Group;

  @Prop({ type: Types.ObjectId, ref: Permission.name, autopopulate: true })
  permission: Permission;

  toApolloGroupInfo: () => ApolloGroupInfo;

  switchGroup: (using: boolean) => void;
}

const GroupInfoSchema = SchemaFactory.createForClass(GroupInfo);

GroupInfoSchema.methods.toApolloGroupInfo = function (
  this: GroupInfo,
): ApolloGroupInfo {
  const apolloGroupInfo = new ApolloGroupInfo();
  apolloGroupInfo.inUse = this.inUse;
  apolloGroupInfo.group = this.group.toApolloGroup();
  apolloGroupInfo.permission = this.permission.toApolloPermission();

  return apolloGroupInfo;
};

GroupInfoSchema.methods.switchGroup = function (
  this: GroupInfo,
  using: boolean,
) {
  this.inUse = using;
};

const groupInUse = function (this: User): Group {
  return this.groups.find((gp) => gp.inUse).group;
};

const isLineConnected = function (this: User): boolean {
  if (this.lineUserId && this.lineNotifyToken) {
    return true;
  } else {
    return false;
  }
};

@Schema({ timestamps: true })
export class User {
  _id: Types.ObjectId;

  id: string;

  @Prop({ index: true, unique: true })
  email: string;

  @Prop()
  password?: string;

  @Prop({ type: String })
  name = '';

  @Prop({ type: String })
  phone = '';

  @Prop()
  status: UserStatus;

  @Prop({ type: [GroupInfoSchema] })
  groups: GroupInfo[] = [];

  @Prop()
  language: Language;

  @Prop({ default: Theme.LIGHT })
  theme: Theme;

  @Prop()
  attemptFailedFrom?: Date;

  @Prop()
  attempts?: number;

  @Prop()
  nonce?: string;

  @Prop()
  lineUserId?: string;

  @Prop()
  lineNotifyToken?: string;

  @Prop()
  isMaintenance?: boolean;

  @Prop()
  lineId?: string;

  @Prop()
  photo?: string;

  toApolloUser: () => ApolloUser;

  clearAttempts: () => void;

  groupInUse: () => Group = groupInUse;

  isLineConnected: () => boolean = isLineConnected;
}
export type UserDocument = User & Document;
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.methods.toApolloUser = function (this: User): ApolloUser {
  const apolloUser = new ApolloUser();
  apolloUser.id = this._id.toString();
  apolloUser.email = this.email;
  apolloUser.name = this.name;
  apolloUser.phone = this.phone;
  apolloUser.status = this.status;
  apolloUser.groups = this.groups.flatMap((it) => it.toApolloGroupInfo());
  apolloUser.language = this.language;
  apolloUser.photo = this.photo;
  apolloUser.lineId = this.lineId;
  apolloUser.isMaintenance = this.isMaintenance;
  apolloUser.theme = this.theme;
  apolloUser.isLINEConnected = this.isLineConnected();

  return apolloUser;
};

UserSchema.methods.clearAttempts = function (this: User) {
  this.attempts = null;
  this.attemptFailedFrom = null;
};

UserSchema.methods.groupInUse = groupInUse;

UserSchema.methods.isLineConnected = isLineConnected;
