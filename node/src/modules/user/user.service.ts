import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { GroupInfo, User, UserDocument } from 'src/models/user';
import { ApolloError } from 'apollo-server-express';
import { hash } from 'bcrypt';
import {
  LoginInput,
  UserStatus,
  PermissionInput,
  Action,
  Subject,
  InviteUserInput,
  CreateUserInput,
  CreateUserPayload,
  Language,
  UserFilter,
  UserConnection,
  UserSortField,
  SortOrder,
  PageInfo,
  UserEdge,
  PossibleUser,
  UpdateProfileInput,
  ContactUsInput,
  Rule,
} from 'src/graphql.schema';
import { ErrorCode } from 'src/models/error.code';
import { Group } from 'src/models/group';
import {
  VerificationCode,
  VerificationCodeDocument,
} from 'src/models/verification.code';
import { randomBytes } from 'crypto';
import { DateTime } from 'luxon';
import { ConfigService } from '@nestjs/config';
import { EmailType } from 'src/models/email.type';
import StringUtils from 'src/utils/StringUtils';
import { Model, Types } from 'mongoose';
import { MailService } from '../mail/mail.service';
import { PermissionService } from '../permission/permission.service';
import { AuthService } from '../auth/auth.service';
import { GroupService } from '../group/group.service';
import { ImageMgmtService } from '../image-mgmt/image-mgmt.service';
import { InjectModel } from '@nestjs/mongoose';

const saltRounds = 10;

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(VerificationCode.name)
    private readonly verificationCodeModel: Model<VerificationCodeDocument>,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly permissionService: PermissionService,
    private readonly configService: ConfigService,
    private readonly imageService: ImageMgmtService,
    private readonly mailService: MailService,
  ) {}

  private readonly logger = new Logger(UserService.name);

  async findUserById(id: string): Promise<User | null> {
    const user = await this.userModel.findById(id);
    return user;
  }

  async findUser(email: string): Promise<User | null> {
    const user = await this.userModel.findOne({
      email,
    });
    return user;
  }

  async findUsers(emails: string[]): Promise<User[]> {
    return this.userModel.find({
      email: { $in: emails },
    });
  }

  async searchUsers(
    groupId: string,
    filter?: UserFilter,
    size?: number,
    after?: string,
    before?: string,
  ): Promise<UserConnection> {
    // Build up the query for filter
    let filterCondition = {};
    const sortField = filter?.userSortField
      ? filter.userSortField
      : UserSortField.EMAIL;
    const sortOrder = filter?.sortOrder
      ? filter.sortOrder
      : SortOrder.ASCENDING;

    const ids = [new Types.ObjectId(groupId)]; // only include own group

    if (filter) {
      const { keyword } = filter;
      const regKeyword = new RegExp(StringUtils.escapeRegExp(keyword), 'i');
      const { Maintenance } = filter;
      let condition = {};
      if (Maintenance == true) {
        condition = {
          $or: [{ isMaintenance: { $in: true } }],
        };
      }
      filterCondition = {
        $and: [
          condition,
          {
            $and: [
              {
                groups: {
                  $elemMatch: {
                    group: { $in: ids },
                  },
                },
              },

              {
                $or: [
                  { email: { $regex: regKeyword } },
                  { name: { $regex: regKeyword } },
                  { phone: { $regex: regKeyword } },
                ],
              },
            ],
          },
        ],
      };
    } else {
      filterCondition = {
        groups: {
          $elemMatch: {
            group: { $in: ids },
          },
        },
      };
    }

    const edges = await this.mongoQueryForUsers(
      size,
      filterCondition,
      sortField,
      sortOrder,
      before ? true : false,
      after || before,
    );

    // Save the users into the connection
    const userConnection = new UserConnection();
    userConnection.edges = [];
    const pageInfo = new PageInfo();

    let index = 0;
    for (const edge of edges) {
      index += 1;
      if (index < size + 1) {
        userConnection.edges.push(edge);
      }
    }

    if (before) {
      userConnection.edges.reverse();

      pageInfo.hasPreviousPage = edges.length === size + 1;
      pageInfo.beforeCursor = userConnection.edges[0]?.cursor;

      pageInfo.endCursor =
        userConnection.edges[userConnection.edges.length - 1]?.cursor;
      if (pageInfo.endCursor) {
        const more = await this.mongoQueryForUsers(
          size,
          filterCondition,
          sortField,
          sortOrder,
          false,
          pageInfo.endCursor,
        );
        pageInfo.hasNextPage = more.length > 0;
      } else {
        pageInfo.hasNextPage = false;
      }
    } else {
      pageInfo.hasNextPage = edges.length === size + 1;
      pageInfo.endCursor =
        userConnection.edges[userConnection.edges.length - 1]?.cursor;

      pageInfo.beforeCursor = userConnection.edges[0]?.cursor;
      if (pageInfo.beforeCursor) {
        const more = await this.mongoQueryForUsers(
          size,
          filterCondition,
          sortField,
          sortOrder,
          true,
          pageInfo.beforeCursor,
        );

        pageInfo.hasPreviousPage = more.length > 0;
      } else {
        pageInfo.hasPreviousPage = false;
      }
    }

    userConnection.pageInfo = pageInfo;
    userConnection.totalCount = await this.userModel
      .find(filterCondition)
      .countDocuments();

    return userConnection;
  }

  async searchUsersByKeyword(
    groupId: string,
    keyword: string,
  ): Promise<User[]> {
    const regKeyword = new RegExp(StringUtils.escapeRegExp(keyword), 'i');
    const groupIds = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );

    return this.userModel.find({
      $and: [
        { 'groups.group': { $in: groupIds } },
        {
          name: { $regex: regKeyword },
        },
      ],
    });
  }

  private async mongoQueryForUsers(
    size: number,
    filterCondition: any,
    sortField: UserSortField,
    sortOrder: SortOrder,
    reversed: boolean,
    after?: string,
  ): Promise<UserEdge[]> {
    let mainCondition = {};

    let idAfter = {};
    let order: SortOrder;
    if (reversed) {
      idAfter = { $lt: after };
      switch (sortOrder) {
        case SortOrder.ASCENDING: {
          order = SortOrder.DESCENDING;
          break;
        }
        case SortOrder.DESCENDING: {
          order = SortOrder.ASCENDING;
          break;
        }
      }
    } else {
      idAfter = { $gt: after };
      order = sortOrder;
    }

    if (after) {
      let pageCondition = {};
      const lastUser = await this.userModel.findOne({
        _id: after,
      });

      switch (sortField) {
        case UserSortField.EMAIL:
          pageCondition = {
            $or: [
              {
                email:
                  order === SortOrder.ASCENDING
                    ? { $gt: lastUser.email }
                    : { $lt: lastUser.email },
              },
              {
                email: lastUser.email,
                _id: idAfter,
              },
            ],
          };
          break;
        case UserSortField.NAME:
          pageCondition = {
            $or: [
              {
                name:
                  order === SortOrder.ASCENDING
                    ? { $gt: lastUser.name }
                    : { $lt: lastUser.name },
              },
              {
                name: lastUser.name,
                _id: idAfter,
              },
            ],
          };
          break;
        case UserSortField.PHONE:
          pageCondition = {
            $or: [
              {
                phone:
                  order === SortOrder.ASCENDING
                    ? { $gt: lastUser.phone }
                    : { $lt: lastUser.phone },
              },
              {
                phone: lastUser.phone,
                _id: idAfter,
              },
            ],
          };
          break;
      }

      mainCondition = {
        $and: [filterCondition, pageCondition],
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mainCondition = filterCondition;
    }

    let sortCondition = {};
    switch (sortField) {
      case UserSortField.EMAIL:
        sortCondition = {
          email: order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case UserSortField.NAME:
        sortCondition = {
          name: order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case UserSortField.PHONE:
        sortCondition = {
          phone: order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
    }

    const queryAfterLimit = await this.userModel
      .find(mainCondition)
      .sort(sortCondition)
      .limit(size + 1)
      .exec();

    const edges = queryAfterLimit.flatMap((user) => {
      const edge = new UserEdge();
      edge.node = user.toApolloUser();
      edge.cursor = user._id as string;
      return edge;
    });

    return edges;
  }

  async possibleUsers(
    keyword: string,
    size: number,
    groupId?: string,
  ): Promise<PossibleUser[]> {
    // condition for group
    let conditionForGroup = {};
    if (groupId) {
      const ids = await this.groupService.getAllChilds(
        new Types.ObjectId(groupId),
        true,
      );

      conditionForGroup = {
        groups: {
          $elemMatch: {
            group: { $in: ids },
          },
        },
      };
    }

    // the whole condition
    const regKeyword = new RegExp(StringUtils.escapeRegExp(keyword), 'i');
    const condition = {
      $and: [
        {
          $or: [
            { email: { $regex: regKeyword } },
            { name: { $regex: regKeyword } },
          ],
        },
        conditionForGroup,
      ],
    };

    const users = await this.userModel.find(condition).limit(size);
    return users === null
      ? []
      : users.flatMap((it) => {
          const possibleUser = new PossibleUser();
          possibleUser.email = it.email;
          possibleUser.name = it.name;
          return possibleUser;
        });
  }

  async invite(inviter: User, inviteUserInput: InviteUserInput): Promise<User> {
    const group = await this.groupService.getGroup(inviteUserInput.groupId);
    if (group === null) {
      throw new ApolloError(
        `Cannot find group ${inviteUserInput.groupId} in the database.`,
        ErrorCode.GROUP_NOT_FOUND,
      );
    }

    let user = await this.findUser(inviteUserInput.email);
    const permissions = inviteUserInput.permissions || [];
    if (user === null) {
      // the completely new user
      // create the permission
      const permission = await this.permissionService.create(permissions);

      // create user
      user = new User();
      user.email = inviteUserInput.email;
      user.status = UserStatus.WAITING;

      const groupInfo = new GroupInfo();
      groupInfo.inUse = true;
      groupInfo.group = group;
      groupInfo.permission = permission;

      user.groups.push(groupInfo);
      user = await this.userModel.create(user);

      // create verification Code
      const vCode = await this.createVerificationCode(
        user,
        EmailType.REGISTER_ACCOUNT,
      );

      // send email (need to verify the account - 1st)
      this.logger.debug('Send Email (Need to Verified)');
      await this.mailService.sendVerificationMail(
        user,
        EmailType.REGISTER_ACCOUNT,
        inviter,
        vCode,
      );
    } else {
      // the existing user
      const { groups } = user;
      if (
        groups
          .flatMap((it) => it.group._id.toHexString())
          .includes(inviteUserInput.groupId)
      ) {
        // cannot invite the user to the existing group with new permission
        if (inviteUserInput.permissions) {
          throw new ApolloError(
            `The user ${user.email} existed in the ${group.name} already, and you cannot invite him with new permission.`,
            ErrorCode.USER_ALREADY_EXISTED,
          );
        }
        // invite again
        const gInfo = groups.filter(
          (it) => it.group._id.toHexString() === inviteUserInput.groupId,
        )[0];
        if (user.status === UserStatus.ACTIVE) {
          // verified user
          throw new ApolloError(
            `${inviteUserInput.email} exists in the group (${gInfo.group.name}) already.`,
            ErrorCode.USER_ALREADY_EXISTED,
          );
        } else {
          // not verified user
          await this.snedRegisterMail(inviter, user);

          // send email (need to verify the account - 2+)
          this.logger.debug(
            'Send Email Again (Need to Verified - Already in Group)',
          );
        }
      } else {
        // invite user to the new group
        // create the permission
        const permission = await this.permissionService.create(permissions);

        // update user
        const groupInfo = new GroupInfo();
        groupInfo.inUse = false;
        groupInfo.group = group;
        groupInfo.permission = permission;

        user.groups.push(groupInfo);
        await this.userModel.updateOne({ _id: user._id }, user);

        if (user.status === UserStatus.ACTIVE) {
          // send email (notify only, no verified process needed)
          this.logger.debug('Send Email (Notify Only)');
          await this.mailService.sendVerificationMail(
            user,
            EmailType.REGISTER_ACCOUNT,
            inviter,
          );
        } else {
          // not verified user
          await this.snedRegisterMail(inviter, user);

          // send email (need to verify the account - 2+)
          this.logger.debug(
            'Send Email Again (Need to Verified - New to this Group)',
          );
        }
      }
    }
    return user;
  }

  async createUser(
    createUserInput: CreateUserInput,
  ): Promise<CreateUserPayload> {
    // check the format or max length of password, name, phone
    if (!this.isValidCreateUserInput(createUserInput)) {
      throw new ApolloError(
        'Please check the length of your inputs.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }

    const user = await this.findUser(createUserInput.email);
    if (user === null) {
      throw new ApolloError(
        'The user does not exist.',
        ErrorCode.AUTH_USER_NOT_FOUND,
      );
    }

    const verificationCode = await this.isValidAccessCode(
      createUserInput.accessCode,
      EmailType.REGISTER_ACCOUNT,
      user,
    );
    if (verificationCode === null) {
      throw new ApolloError(
        'Cannot validate the information you provided.',
        ErrorCode.ACCESS_CODE_INVALID,
      );
    }

    const hashedPassword = await hash(createUserInput.password, saltRounds);
    user.status = UserStatus.ACTIVE;
    user.password = hashedPassword;
    user.name = createUserInput.name;
    user.phone = createUserInput.phone;
    user.language = createUserInput.language;

    await this.userModel.findOneAndUpdate({ _id: user._id }, user, {
      useFindAndModify: false,
    });

    // generate the new device token
    const deviceToken = await this.authService.createDeviceToken(user);

    const loginInput = new LoginInput();
    loginInput.email = createUserInput.email;
    loginInput.password = createUserInput.password;
    const loginPayload = await this.authService.login(loginInput);

    const createUserPayload = new CreateUserPayload();
    createUserPayload.refreshToken = loginPayload.refreshToken;
    createUserPayload.refreshTokenExpiresAt =
      loginPayload.refreshTokenExpiresAt;
    createUserPayload.deviceToken = deviceToken;
    return createUserPayload;
  }

  async getUserCount(groupId: Types.ObjectId): Promise<number> {
    return this.userModel.find({ 'groups.group': groupId }).countDocuments();
  }

  async removeUsersFrom(deleter: User, groupId: string): Promise<boolean> {
    const users = await this.userModel.find({
      groups: { $elemMatch: { group: new Types.ObjectId(groupId) } },
    });
    return !!(await this.deleteUsers(
      deleter,
      groupId,
      users.flatMap((it) => it.email),
    ));
  }

  async updateAttempts(
    userId: string,
    attemptFailedFrom?: Date,
    attempts?: number,
  ): Promise<User> {
    return this.userModel.findByIdAndUpdate(
      userId,
      {
        attemptFailedFrom,
        attempts,
      },
      {
        useFindAndModify: false,
      },
    );
  }

  private async createVerificationCode(
    user: User,
    type: EmailType,
  ): Promise<VerificationCode> {
    const vericationCode = new VerificationCode();
    vericationCode.user = user;
    vericationCode.code = randomBytes(16).toString('hex');
    vericationCode.expiresAt = DateTime.now()
      .plus({
        second:
          type === EmailType.REGISTER_ACCOUNT
            ? this.configService.get<number>(
                'VERIFICATION_CODE_EXPIRED_FOR_REGISTER_IN_SECONDS',
              )
            : this.configService.get<number>(
                'VERIFICATION_CODE_EXPIRED_IN_SECONDS',
              ),
      })
      .toJSDate();
    vericationCode.available = true;
    vericationCode.type = type;
    return this.verificationCodeModel.create(vericationCode);
  }

  async isValidAccessCode(
    accessCode: string,
    type: EmailType,
    user?: User,
  ): Promise<VerificationCode> {
    try {
      const encodedString = Buffer.from(accessCode, 'base64').toString(
        'binary',
      );
      const data = encodedString.split('.');
      const userId = data[0];
      const code = data[1];
      this.logger.log(
        `isValidAccessCode => userId = ${userId}, code = ${code}`,
      );

      if (user !== undefined) {
        if (user._id.toHexString() !== userId) {
          this.logger.debug(
            `userId in the accessCode is different from the user you want to init the password.`,
          );
          return null;
        }
      }
      const originalUser = await this.findUserById(userId);
      const verificationCode = await this.verificationCodeModel.findOne({
        user: originalUser._id,
        code,
        available: true,
        type,
      });

      if (verificationCode !== undefined) {
        if (verificationCode.expiresAt > new Date()) {
          await this.verificationCodeModel.findByIdAndUpdate(
            verificationCode._id,
            { available: false },
            {
              useFindAndModify: false,
            },
          );

          return verificationCode;
        }
        await this.deleteVerificationCode(verificationCode);
        this.logger.debug(
          `The verification code (${verificationCode.code}) is expired. Try to resend the email again.`,
        );
      }
      return null;
    } catch {
      return null;
    }
  }

  async getVerificationCode(
    user: User,
    type: EmailType,
  ): Promise<VerificationCode> {
    const vCode = await this.verificationCodeModel.findOne({
      user,
      available: true,
      type,
    });
    // if not existed before, create the new one
    if (vCode === null) {
      return this.createVerificationCode(user, type);
    }

    // handle the expired verification code
    if (vCode.expiresAt < new Date()) {
      this.logger.log(
        `getVerificationCode for ${user.name}, but verificationCode is expired. Create the new one.`,
      );
      await this.deleteVerificationCode(vCode);
      return this.createVerificationCode(user, type);
    }
    return vCode;
  }

  async deleteVerificationCode(code: VerificationCode): Promise<boolean> {
    return !!(await this.verificationCodeModel.findByIdAndDelete(code._id));
  }

  async updatePassword(user: User, newPassword: string): Promise<boolean> {
    return !!(await this.userModel.findByIdAndUpdate(
      user._id,
      {
        password: await hash(newPassword, saltRounds),
      },
      {
        useFindAndModify: false,
      },
    ));
  }

  async updateProfile(
    user: User,
    updateProfileInput: UpdateProfileInput,
  ): Promise<User> {
    // check user name cannot be empty string and the max length of name and phone
    if (!this.isValidUpdateProfileInput(updateProfileInput)) {
      throw new ApolloError(
        'Please check the length of your inputs.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }

    return this.userModel.findByIdAndUpdate(
      user._id,
      {
        name: updateProfileInput.name ? updateProfileInput.name : user.name,
        phone: updateProfileInput.phone ? updateProfileInput.phone : user.phone,
        language: updateProfileInput.language
          ? updateProfileInput.language
          : user.language,
        theme: updateProfileInput.theme ? updateProfileInput.theme : user.theme,
        photo: updateProfileInput.photo ? updateProfileInput.photo : user.photo,
      },
      {
        new: true,
        useFindAndModify: false,
      },
    );
  }

  async editUser(
    user: User,
    groupId: string,
    permissions: PermissionInput[],
  ): Promise<User> {
    const group = user.groups.find(
      (gp) => gp.group._id.toHexString() === groupId,
    );
    if (group == null) {
      throw new ApolloError(
        `Cannot find group ${groupId} for ${user.name} in the database.`,
        ErrorCode.GROUP_NOT_FOUND,
      );
    }

    await this.permissionService.update(
      group.permission._id.toHexString(),
      permissions,
    );
    return this.findUser(user.email);
  }

  async deleteUsers(
    deleter: User,
    groupId: string,
    emails: string[],
  ): Promise<string[]> {
    const deletable: string[] = [];
    this.logger.log(`delete users ${JSON.stringify(emails)} from ${groupId}.`);

    // deleter cannot delete himself from the group currently used
    let validEmails = emails;
    if (deleter.groupInUse().id === groupId) {
      validEmails = emails.filter((it) => it !== deleter.email);
    }

    // deleter cannot delete the admin user
    const adminMail = this.configService.get<string>('ROOT_USER_EMAIL');
    if (validEmails.includes(adminMail)) {
      throw new ApolloError(
        `You cannot delete the admin user - ${adminMail}.`,
        ErrorCode.USER_ADMIN_CANNOT_BE_DELETED,
      );
    }

    await Promise.all(
      validEmails.flatMap(async (email) => {
        let user = await this.findUser(email);

        if (user !== null) {
          const groupInfo = user.groups.find(
            (it) => it.group._id.toHexString() === groupId,
          );

          if (groupInfo != null) {
            // delete user's permission
            if (groupInfo.permission != null) {
              await this.permissionService.delete([
                groupInfo.permission._id.toHexString(),
              ]);
            }

            // remove group from this user
            const groupsForUser = user.groups.flatMap((it) => it.group.id);
            const index = groupsForUser.indexOf(groupId);
            if (index > -1) {
              user.groups.splice(index, 1);
              user = await this.userModel.findByIdAndUpdate(user._id, user, {
                new: true,
                useFindAndModify: false,
              });
              deletable.push(user.email);
            }

            // if delete the the group user is using, change it to another
            if (groupInfo.inUse && user.groups.length > 0) {
              await this.userModel.findByIdAndUpdate(
                user._id,
                {
                  $set: { 'groups.0.inUse': true },
                },
                {
                  useFindAndModify: false,
                },
              );
            }
          }
        }
      }),
    );

    return deletable;
  }

  async contactUs(contactUsInput: ContactUsInput): Promise<boolean> {
    return this.mailService.sendContactUsMail(contactUsInput);
  }

  async isPermissionValid(
    editor: User,
    user: User,
    groupId: string,
    permissions?: PermissionInput[],
  ): Promise<boolean> {
    const group = user?.groups.find(
      (gp) => gp.group._id.toHexString() === groupId,
    );

    const editorRules = editor.groups.find((it) => it.inUse === true).permission
      .rules;
    const userRules = group?.permission?.rules ? group?.permission?.rules : [];

    // skip the check if the permissions is null (invite again)
    if (permissions) {
      // you cannot add the rule not in editor or user
      const rulesNotInEditorOrUser = permissions?.some(
        (p) =>
          !this.containRule(editorRules, p) && !this.containRule(userRules, p),
      );
      if (rulesNotInEditorOrUser) {
        return false;
      }

      // you cannot delete the rule from user not in the editor
      const removedRules = userRules.filter((rule) => {
        return !this.containRule(permissions, rule);
      });
      const deleteDeniedRules = removedRules.some(
        (r) => !this.containRule(editorRules, r),
      );
      if (deleteDeniedRules) {
        return false;
      }
    }

    return true;
  }

  async updateLineNonce(user: User, nonce: string): Promise<boolean> {
    return !!(await this.userModel.findByIdAndUpdate(user._id, {
      nonce,
    }));
  }

  async updateLineUserId(nonce: string, lineUserId: string): Promise<boolean> {
    return !!(await this.userModel.findOneAndUpdate(
      {
        nonce,
      },
      {
        lineUserId,
        nonce: null,
      },
    ));
  }

  async clearLineUserId(lineUserId: string): Promise<boolean> {
    return !!(await this.userModel.findOneAndUpdate(
      {
        lineUserId,
      },
      {
        lineUserId: null,
        nonce: null,
        lineNotifyToken: null,
      },
    ));
  }

  async getUserByLineID(lineUserId: string): Promise<User> {
    return this.userModel.findOne({ lineUserId });
  }

  async updateLineNotifyToken(state: string, token: string): Promise<User> {
    return this.userModel.findByIdAndUpdate(
      state,
      {
        lineNotifyToken: token,
      },
      {
        new: true,
      },
    );
  }

  async isUsersUnder(groupId: string, userMails: string[]): Promise<boolean> {
    const users = await this.findUsers(userMails);
    const results = await Promise.all(
      users.flatMap(async (user) => {
        return (
          await Promise.all(
            user.groups.map(async (gInfo) => {
              const groups = await this.groupService.getAllChilds(
                new Types.ObjectId(groupId),
                true,
              );
              return groups
                .flatMap((it) => it.toHexString())
                .includes(gInfo.group.id);
            }),
          )
        ).some((val) => val);
      }),
    );
    return !results.includes(false);
  }

  private containRule(
    rules: PermissionInput[] | Rule[],
    rule: PermissionInput | Rule,
  ): boolean {
    return rules.some(
      (r) => r.action === rule.action && r.subject === rule.subject,
    );
  }

  private async snedRegisterMail(inviter: User, user: User): Promise<boolean> {
    const vCode = await this.getVerificationCode(
      user,
      EmailType.REGISTER_ACCOUNT,
    );
    return this.mailService.sendVerificationMail(
      user,
      EmailType.REGISTER_ACCOUNT,
      inviter,
      vCode,
    );
  }

  private isValidCreateUserInput(createUserInput: CreateUserInput): boolean {
    if (createUserInput.name.length === 0 || createUserInput.name.length > 32) {
      return false;
    }

    if (createUserInput.phone.length > 200) {
      return false;
    }

    if (!StringUtils.isValidPassword(createUserInput.password)) {
      return false;
    }

    return true;
  }

  private isValidUpdateProfileInput(
    updateProfileInput: UpdateProfileInput,
  ): boolean {
    if (updateProfileInput.name) {
      if (
        updateProfileInput.name.length === 0 ||
        updateProfileInput.name.length > 32
      ) {
        return false;
      }
    }

    if (updateProfileInput.phone) {
      if (updateProfileInput.phone.length > 200) {
        return false;
      }
    }

    return true;
  }

  async initialize(group: Group): Promise<User> {
    const rootUser = await this.findUser(
      this.configService.get<string>('ROOT_USER_EMAIL'),
    );

    // apply the whole permissions to the root admin user
    const permissionInputs: PermissionInput[] = [];
    Object.keys(Action).map((action) => {
      Object.keys(Subject).map((subject) => {
        const permissionInput = new PermissionInput();
        permissionInput.action = Action[action] as Action;
        permissionInput.subject = Subject[subject] as Subject;
        permissionInputs.push(permissionInput);
        return true;
      });
      return true;
    });

    if (rootUser) {
      const gInfo = rootUser.groups.find((gp) => gp.group.id === group.id);
      await this.permissionService.update(
        gInfo.permission._id.toHexString(),
        permissionInputs,
      );
      return rootUser;
    } else {
      const user = new User();
      user.name = this.configService.get<string>('ROOT_USER_NAME');
      user.status = UserStatus.ACTIVE;
      user.email = this.configService.get<string>('ROOT_USER_EMAIL');
      user.phone = this.configService.get<string>('ROOT_USER_PHONE');
      user.password = await hash(
        this.configService.get<string>('ROOT_USER_PASSWORD'),
        saltRounds,
      );
      user.language = Language.en_US;

      const groupInfo = new GroupInfo();
      groupInfo.inUse = true;
      groupInfo.group = group;
      groupInfo.permission = await this.permissionService.create(
        permissionInputs,
      );
      user.groups = [groupInfo];

      this.logger.log(
        `There is no user in the CityOS, and create it automatically: ${JSON.stringify(
          user,
        )}`,
      );
      return this.userModel.create(user);
    }
  }

  async getUserById(userId: string): Promise<User> {
    return this.userModel
      .findOne({
        _id: userId,
      })
      .populate({ path: 'groups' });
  }
}
