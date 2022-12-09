import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { User } from 'src/models/user';
import {
  Action,
  ContactUsInput,
  CreateUserInput,
  CreateUserPayload,
  InviteUserInput,
  PermissionInput,
  PossibleUser,
  Subject,
  UpdateProfileInput,
  UserConnection,
  UserFilter,
  User as ApolloUser,
} from 'src/graphql.schema';
import { forwardRef, Inject, UseGuards } from '@nestjs/common';
import { ApolloError, ForbiddenError } from 'apollo-server-express';
import { ErrorCode } from 'src/models/error.code';
import { Log, UserEvent } from 'src/models/log';
import { UserService } from './user.service';
import { CurrentUser, Public } from '../auth/auth.decorator';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { AppAbility } from '../permission/ability.factory';
import { GroupService } from '../group/group.service';
import { LogService } from '../log/log.service';

@Resolver('User')
export class UserResolver {
  constructor(
    private readonly userService: UserService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    private readonly logService: LogService,
  ) {}

  @Query()
  async userProfile(@CurrentUser() user: User): Promise<ApolloUser> {
    return user.toApolloUser();
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.USER),
  )
  @Query()
  async searchUsers(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('filter') filter?: UserFilter,
    @Args('size') size?: number,
    @Args('after') after?: string,
    @Args('before') before?: string,
  ): Promise<UserConnection> {
    // permission check: 'groupId' should be under the current group of currentUser
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    if (after && before) {
      throw new ApolloError(
        'You can not provide the after and before at the same time.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }

    return this.userService.searchUsers(groupId, filter, size, after, before);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.ADD, Subject.USER),
  )
  @Query()
  async possibleUsers(
    @Args('keyword') keyword: string,
    @Args('size') size: number,
    @Args('groupId') groupId?: string,
  ): Promise<PossibleUser[]> {
    return this.userService.possibleUsers(keyword, size, groupId);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.ADD, Subject.USER),
  )
  @Mutation(() => User, { name: 'inviteUser' })
  async inviteUser(
    @CurrentUser() inviter: User,
    @Args('inviteUserInput') inviteUserInput: InviteUserInput,
  ): Promise<ApolloUser> {
    const user = await this.userService.findUser(inviteUserInput.email);

    // permission check: 'groupId' in inviteUserInput should be under the current group of currentUser
    if (
      !(await this.groupService.isGroupUnder(inviter, inviteUserInput.groupId))
    ) {
      throw new ForbiddenError(
        `You have no permission to invite ${inviteUserInput.email} to ${inviteUserInput.groupId}. Please check groupId or permissions you provided.`,
      );
    }

    // permission check: check the permissions is valid
    if (
      !(await this.userService.isPermissionValid(
        inviter,
        user,
        inviteUserInput.groupId,
        inviteUserInput.permissions,
      ))
    ) {
      throw new ForbiddenError(
        `You have no permission to invite ${inviteUserInput.email} to ${inviteUserInput.groupId}. Please check groupId or permissions you provided.`,
      );
    }

    // log
    const log = new Log(
      inviter,
      UserEvent.ADD_USER,
      inviteUserInput.groupId,
      [inviteUserInput.email],
      JSON.stringify(inviteUserInput.permissions || []),
    );
    await this.logService.insertEvent(log);

    return (
      await this.userService.invite(inviter, inviteUserInput)
    ).toApolloUser();
  }

  @Public()
  @Mutation(() => Boolean, { name: 'createUser' })
  createUser(
    @Args('createUserInput') createUserInput: CreateUserInput,
  ): Promise<CreateUserPayload> {
    return this.userService.createUser(createUserInput);
  }

  @Mutation()
  async updateProfile(
    @CurrentUser() user: User,
    @Args('updateProfileInput') updateProfileInput: UpdateProfileInput,
  ): Promise<ApolloUser> {
    return (
      await this.userService.updateProfile(user, updateProfileInput)
    ).toApolloUser();
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.MODIFY, Subject.USER),
  )
  @Mutation()
  async editUser(
    @CurrentUser() editor: User,
    @Args('email') email: string,
    @Args('groupId') groupId: string,
    @Args('permissions') permissions: PermissionInput[],
  ): Promise<ApolloUser> {
    const user = await this.userService.findUser(email);
    if (user === null) {
      throw new ApolloError(
        `Cannot find user ${email} in the database.`,
        ErrorCode.AUTH_USER_NOT_FOUND,
      );
    }

    // permission check: 'groupId' should be or be under the current group of currentUser
    // permission check: the 'email' user can't be currentUser
    // permission check: check the permissions is valid
    if (
      !(await this.groupService.isGroupUnder(editor, groupId)) ||
      editor.email === email ||
      !(await this.userService.isPermissionValid(
        editor,
        user,
        groupId,
        permissions,
      ))
    ) {
      throw new ForbiddenError(
        `You have no permission to apply this permissions to this user.`,
      );
    }

    // log
    const log = new Log(
      editor,
      UserEvent.MODIFY_USER,
      groupId,
      [email],
      JSON.stringify(permissions),
    );
    await this.logService.insertEvent(log);

    return (
      await this.userService.editUser(user, groupId, permissions)
    ).toApolloUser();
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.REMOVE, Subject.USER),
  )
  @Mutation()
  async deleteUsers(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('emails') emails: string[],
  ): Promise<string[]> {
    // permission check: 'groupId' should be or be under the current group of currentUser
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(
        `You have no permission to delete them from ${groupId}.`,
      );
    }

    // log
    const log = new Log(user, UserEvent.REMOVE_USER, groupId, emails);
    await this.logService.insertEvent(log);

    return this.userService.deleteUsers(user, groupId, emails);
  }

  @Public()
  @Mutation()
  async contactUs(
    @Args('contactUsInput') contactUsInput: ContactUsInput,
  ): Promise<boolean> {
    return this.userService.contactUs(contactUsInput);
  }
}
