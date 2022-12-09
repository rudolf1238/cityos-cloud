import { UseGuards } from '@nestjs/common';
import {
  Resolver,
  Query,
  Mutation,
  Args,
  ResolveField,
  Parent,
} from '@nestjs/graphql';
import { ForbiddenError } from 'apollo-server-express';
import { User } from 'src/models/user';
import {
  Action,
  Group,
  CreateGroupInput,
  Subject,
  Level,
  Sensor,
  EditGroupInput,
  DeviceType,
} from 'src/graphql.schema';
import { Log, UserEvent } from 'src/models/log';
import { Types } from 'mongoose';
import { CurrentUser } from '../auth/auth.decorator';
import { AppAbility } from '../permission/ability.factory';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { GroupService } from './group.service';
import { LogService } from '../log/log.service';

@Resolver('Group')
export class GroupResolver {
  constructor(
    private readonly groupService: GroupService,
    private logService: LogService,
  ) {}

  @ResolveField('subGroups', () => [Types.ObjectId])
  async subGroups(@Parent() group: Group) {
    return this.groupService.getDirectChilds(new Types.ObjectId(group.id));
  }

  @ResolveField('deviceCount', () => Number)
  async deviceCount(@Parent() group: Group) {
    return this.groupService.getDeviceCount(new Types.ObjectId(group.id));
  }

  @ResolveField('userCount', () => Number)
  async userCount(@Parent() group: Group) {
    return this.groupService.getUserCount(new Types.ObjectId(group.id));
  }

  @ResolveField('level', () => Level)
  async level(@Parent() group: Group) {
    const parentCount = group.ancestors ? group.ancestors.length : 0;
    if (parentCount === 0) {
      return Level.ROOT;
    }
    if (parentCount === 1) {
      return Level.PROJECT;
    }
    if (parentCount >= 2) {
      const hasChild = (await this.subGroups(group))?.length > 0;
      if (hasChild) {
        return Level.PARENT;
      }
    }
    return Level.LEAF;
  }

  @ResolveField('sensors', () => [Sensor])
  async sensors(
    @Parent() group: Group,
    @Args('deviceType') deviceType?: DeviceType,
    @Args('deviceIds') deviceIds?: string[],
  ) {
    return this.groupService.getSensors(group.id, deviceType, deviceIds);
  }

  @Mutation('createGroup')
  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.ADD, Subject.GROUP),
  )
  async createGroup(
    @CurrentUser() user: User,
    @Args('createGroupInput') createGroupInput: CreateGroupInput,
  ): Promise<boolean> {
    // permission check: parentGroupId is user's current group or sub-group
    if (
      !(await this.groupService.isGroupUnder(
        user,
        createGroupInput.parentGroupId,
      ))
    ) {
      throw new ForbiddenError(
        `You have no permission to create the group under ${createGroupInput.parentGroupId}.`,
      );
    }

    const group = await this.groupService.create(createGroupInput);
    // log
    const log = new Log(user, UserEvent.ADD_GROUP, group._id.toHexString(), [
      group._id.toHexString(),
    ]);
    await this.logService.insertEvent(log);

    return true;
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.GROUP),
  )
  @Query('getGroup')
  async getGroup(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
  ): Promise<Group> {
    // permission check: groupId is user's current group or sub-group
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    const group = await this.groupService.getGroup(groupId);
    return group.toApolloGroup();
  }

  @Query('searchGroups')
  async searchGroups(@CurrentUser() user: User): Promise<Group[]> {
    return (await this.groupService.searchGroups(user)).flatMap((it) => {
      return it.toApolloGroup();
    });
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.MODIFY, Subject.GROUP),
  )
  @Mutation('editGroup')
  async editGroup(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('editGroupInput') editGroupInput: EditGroupInput,
  ): Promise<boolean> {
    // permission check: groupId is user's current group or sub-group
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to edit ${groupId}.`);
    }

    // log
    const log = new Log(
      user,
      UserEvent.MODIFT_GROUP,
      groupId,
      [groupId],
      JSON.stringify(editGroupInput),
    );
    await this.logService.insertEvent(log);

    const group = await this.groupService.getGroup(groupId);
    const level = await this.level(group.toApolloGroup());
    return this.groupService.editGroup(group, level, editGroupInput);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.REMOVE, Subject.GROUP),
  )
  @Mutation('deleteGroup')
  async deleteGroup(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
  ): Promise<boolean> {
    // permission check: groupId is user's current group or sub-group
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to delete ${groupId}.`);
    }

    // log
    const log = new Log(user, UserEvent.REMOVE_GROUP, groupId, [groupId]);
    await this.logService.insertEvent(log);

    const group = await this.groupService.getGroup(groupId);
    const level = await this.level(group.toApolloGroup());
    return this.groupService.deleteGroup(user, group, level);
  }
}
