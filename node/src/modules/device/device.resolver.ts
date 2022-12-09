import { forwardRef, Inject, UseGuards } from '@nestjs/common';
import { Resolver, Args, Query, ResolveField, Mutation } from '@nestjs/graphql';
import { ApolloError, ForbiddenError } from 'apollo-server-express';
import { Lamp } from 'src/models/lamp';
import { User } from 'src/models/user';
import {
  Action,
  Camera,
  Charging,
  IDevice,
  Device,
  DeviceConnection,
  DeviceFilter,
  DeviceType,
  Display,
  EditDeviceInput,
  Environment,
  Solar,
  Subject,
  Water,
  Wifi,
  Building,
  MapClusters,
  MapDevices,
  MapDeviceFilter,
} from 'src/graphql.schema';
import { Log, UserEvent } from 'src/models/log';
import { CurrentUser } from '../auth/auth.decorator';
import { GroupService } from '../group/group.service';
import { AppAbility } from '../permission/ability.factory';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { DeviceService } from './device.service';
import { LogService } from '../log/log.service';
import { ErrorCode } from 'src/models/error.code';

@Resolver('IDevice')
export class DeviceResolver {
  constructor(
    private readonly deviceService: DeviceService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    private logService: LogService,
  ) {}

  @ResolveField()
  __resolveType(obj: IDevice) {
    switch (obj.type) {
      case DeviceType.LAMP: {
        return Lamp.name;
      }
      case DeviceType.SOLAR: {
        return Solar.name;
      }
      case DeviceType.CHARGING: {
        return Charging.name;
      }
      case DeviceType.CAMERA: {
        return Camera.name;
      }
      case DeviceType.WATER: {
        return Water.name;
      }
      case DeviceType.ENVIRONMENT: {
        return Environment.name;
      }
      case DeviceType.WIFI: {
        return Wifi.name;
      }
      case DeviceType.DISPLAY: {
        return Display.name;
      }
      case DeviceType.BUILDING: {
        return Building.name;
      }
      default: {
        return Device.name;
      }
    }
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.LIGHTMAP),
  )
  @Query()
  async searchDevices(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('filter') filter?: DeviceFilter,
    @Args('size') size?: number,
    @Args('after') after?: string,
    @Args('before') before?: string,
  ): Promise<DeviceConnection> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    if (after && before) {
      throw new ApolloError(
        'You can not provide the after and before at the same time.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }

    return this.deviceService.searchDevices(
      groupId,
      filter,
      size,
      after,
      before,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.ADD, Subject.DEVICE),
  )
  @Query()
  async devicesFromIOT(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('type') type?: DeviceType,
    @Args('name') name?: string,
    @Args('desc') desc?: string,
  ): Promise<Device[]> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey == null) return [];
    return this.deviceService.devicesFromIOT(projectKey, type, name, desc);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.LIGHTMAP),
  )
  @Query()
  async getDevices(
    @CurrentUser() user: User,
    @Args('deviceIds') deviceIds: string[],
  ): Promise<Device[]> {
    const devices = await this.deviceService.getDeviceByIds(deviceIds);

    // permission check: 'deviceId' must under user's current division
    if (!(await this.deviceService.isDevicesUnder(user, devices))) {
      throw new ForbiddenError(`You have no permission to get these devices.`);
    }

    return devices.flatMap((it) => it.toApolloDevice());
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.MODIFY, Subject.DEVICE),
  )
  @Mutation()
  async editDevice(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('editDeviceInput') editDeviceInput: EditDeviceInput,
  ): Promise<boolean> {
    // permission check: 'deviceId' must under user's current division
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(`You have no permission to edit ${deviceId}.`);
    }

    // log
    const log = new Log(
      user,
      UserEvent.MODIFY_DEVICE,
      '',
      [deviceId],
      JSON.stringify(editDeviceInput),
    );
    await this.logService.insertEvent(log);

    const projectKey = await this.deviceService.getProjectKeyById(deviceId);
    if (projectKey === null) return false;
    return this.deviceService.editDevice(projectKey, deviceId, editDeviceInput);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.ADD, Subject.DEVICE),
  )
  @Mutation()
  async addDevices(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceIds') deviceIds: string[],
  ): Promise<boolean> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    // log
    const log = new Log(user, UserEvent.ADD_DEVICE, groupId, deviceIds);
    await this.logService.insertEvent(log);

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return false;
    return this.deviceService.addDevices(projectKey, groupId, deviceIds);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.REMOVE, Subject.DEVICE),
  )
  @Mutation()
  async deleteDevices(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceIds') deviceIds: string[],
  ): Promise<string[]> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    // log
    const log = new Log(user, UserEvent.REMOVE_DEVICE, groupId, deviceIds);
    await this.logService.insertEvent(log);

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return [];
    return this.deviceService.deleteDevices(projectKey, groupId, deviceIds);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.REMOVE, Subject.DEVICE),
  )
  @Mutation()
  async restoreDevices(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceIds') deviceIds: string[],
  ): Promise<string[]> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    // log
    const log = new Log(user, UserEvent.RESTORE_DEVICE, groupId, deviceIds);
    await this.logService.insertEvent(log);
    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return [];
    return this.deviceService.restoreDevices(projectKey, groupId, deviceIds);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.LIGHTMAP),
  )
  @Query()
  async searchAbnormalDevices(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('filter') filter?: DeviceFilter,
    @Args('size') size?: number,
    @Args('skip') skip?: number,
  ): Promise<DeviceConnection> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    return this.deviceService.searchAbnormalDevices(
      groupId,
      filter,
      size,
      skip,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.LIGHTMAP),
  )
  @Query()
  async searchDevicesOnMap(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('filter') filter: MapDeviceFilter,
  ): Promise<MapDevices> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    return this.deviceService.searchDevicesOnMap(groupId, filter);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.LIGHTMAP),
  )
  @Query()
  async searchClustersOnMap(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('filter') filter: MapDeviceFilter,
    @Args('level') level = 10,
  ): Promise<MapClusters> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    return this.deviceService.searchClustersOnMap(groupId, filter, level);
  }
}
