import { forwardRef, Inject, UseGuards } from '@nestjs/common';
import { Resolver, Args, Query, Mutation } from '@nestjs/graphql';
import { ForbiddenError } from 'apollo-server-express';
import {
  MalDeviceConnection,
  MalDeviceInput,
  MalDevice,
  MalDeviceUpdate,
  MaldeviceFilter,
  Action,
  Subject,
} from 'src/graphql.schema';
import { MaldeviceService } from './maldevice.service';
import { LogService } from '../log/log.service';
import { Log, UserEvent } from 'src/models/log';
import { GroupService } from '../group/group.service';
import { User } from 'src/models/user';
import { CurrentUser } from '../auth/auth.decorator';
import { AppAbility } from '../permission/ability.factory';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';

@Resolver('MalDevice')
export class MaldeviceResolver {
  constructor(
    private readonly maldeviceService: MaldeviceService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    private logService: LogService,
  ) {}

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.INFO),
  )
  @Query()
  async getMalDevices(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('filter') filter?: MaldeviceFilter,
    @Args('size') size?: number,
    @Args('after') after?: string,
  ): Promise<MalDeviceConnection> {
    // permission check: 'groupId' in inviteUserInput should be under the current group of currentUser
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    const maldevices = await this.maldeviceService.getMalDevices(
      groupId,
      filter,
      size,
      after,
    );
    return maldevices;
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.ADD, Subject.DEVICE) ||
      ability.can(Action.ADD, Subject.INFO),
  )
  @Mutation(() => MalDevice, { name: 'addMlDevices' })
  async addMlDevices(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('MalDeviceInput') malDeviceInput: MalDeviceInput,
  ): Promise<boolean | null> {
    // permission check: 'groupId' in inviteUserInput should be under the current group of currentUser
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    // log
    const log = new Log(user, UserEvent.ADD_DEVICE, groupId, [
      MalDeviceInput.name,
    ]);
    await this.logService.insertEvent(log);

    return this.maldeviceService.add(groupId, malDeviceInput);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.MODIFY, Subject.DEVICE) ||
      ability.can(Action.MODIFY, Subject.INFO),
  )
  @Mutation(() => MalDevice, { name: 'updateMlDevices' })
  async updateMlDevices(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('MalDeviceUpdate') malDeviceUpdate: MalDeviceUpdate,
  ): Promise<boolean | null> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    // log
    const log = new Log(user, UserEvent.ADD_DEVICE, groupId, [
      malDeviceUpdate.status,
    ]);
    await this.logService.insertEvent(log);

    return this.maldeviceService.update(groupId, malDeviceUpdate);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.REMOVE, Subject.DEVICE) ||
      ability.can(Action.REMOVE, Subject.INFO),
  )
  @Mutation(() => MalDevice, { name: 'deleteMlDevices' })
  async deleteMlDevices(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('names') names: string[],
  ): Promise<string[]> {
    const log = new Log(user, UserEvent.ADD_DEVICE, groupId, names);
    await this.logService.insertEvent(log);

    return this.maldeviceService.delete(groupId, names);
  }
}
