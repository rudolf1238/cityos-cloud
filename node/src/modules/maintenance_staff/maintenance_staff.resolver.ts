import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { MaintenanceStaffService } from './maintenance_staff.service';
import { forwardRef, Inject, UseGuards } from '@nestjs/common';
import { ForbiddenError } from 'apollo-server-express';
import { User } from 'src/models/user';
import {
  Action,
  Subject,
  Maintenance_devicelistConnection,
  DeviceFilter,
  AddDeviceConnection,
} from 'src/graphql.schema';
import { CurrentUser } from '../auth/auth.decorator';
import { GroupService } from '../group/group.service';
import { AppAbility } from '../permission/ability.factory';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { LogService } from '../log/log.service';

@Resolver('ResponseMSG')
export class MaintenanceStaffResolver {
  constructor(
    private readonly maintenanceStaffService: MaintenanceStaffService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    private logService: LogService,
  ) {}

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.LIGHTMAP),
  )
  @Query()
  async getMaintenance_devicelist(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('userId') userId: string,
    @Args('filter') filter?: DeviceFilter,
    @Args('size') size?: number,
    @Args('after') after?: string,
  ): Promise<Maintenance_devicelistConnection> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    const message = await this.maintenanceStaffService.getMaintenanceDevicelist(
      groupId,
      userId,
      filter,
      size,
      after,
    );

    console.log(message);
    return message;
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.LIGHTMAP),
  )
  @Query()
  async searchAddDevices(
    @CurrentUser() user: User,
    @Args('userId') userId: string,
    @Args('groupId') groupId: string,
    @Args('filter') filter?: DeviceFilter,
  ): Promise<AddDeviceConnection> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    return this.maintenanceStaffService.searchAddDevicesbystaff(
      groupId,
      userId,
      filter,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.REMOVE, Subject.USER),
  )
  @Mutation()
  async deleteStaffs(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('userIds') userIds: string[],
  ): Promise<string[]> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return [];
    return this.maintenanceStaffService.deleteStaffs(
      projectKey,
      groupId,
      userIds,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.ADD, Subject.USER),
  )
  @Mutation()
  async addDevices_Staff(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceIds') deviceIds: string[],
    @Args('userId') userId: string,
  ): Promise<boolean> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    return this.maintenanceStaffService.addDevicesStaff(
      groupId,
      deviceIds,
      userId,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.REMOVE, Subject.USER),
  )
  @Mutation()
  async deleteStaffDevices(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceIds') deviceIds: string[],
    @Args('userId') userId: string,
  ): Promise<string[]> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    return this.maintenanceStaffService.deleteStaffDevices(
      groupId,
      deviceIds,
      userId,
    );
  }
}
