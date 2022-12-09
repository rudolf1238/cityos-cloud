import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BuildingService } from './building.service';

import { forwardRef, Inject, UseGuards } from '@nestjs/common';
import { ApolloError, ForbiddenError } from 'apollo-server-express';
import { User } from 'src/models/user';
import {
  Action,
  Subject,
  GetBuilding,
  DeviceFilter,
  BuildingInput,
  GPSPoint,
  DeviceConnection,
  DeviceFilterForBuilding,
} from 'src/graphql.schema';
import { CurrentUser } from '../auth/auth.decorator';
import { GroupService } from '../group/group.service';
import { AppAbility } from '../permission/ability.factory';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { LogService } from '../log/log.service';
import { ErrorCode } from 'src/models/error.code';

@Resolver('Building')
export class BuildingResolver {
  constructor(
    // eslint-disable-next-line @typescript-eslint/no-shadow
    private readonly BuildingService: BuildingService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    private logService: LogService,
  ) {}

  // @UseGuards(PermissionGuard)
  // @CheckPermissions(
  //   (ability: AppAbility) =>
  //     ability.can(Action.VIEW, Subject.DEVICE) ||
  //     ability.can(Action.VIEW, Subject.LIGHTMAP),
  // )
  @Query()
  async getBuildings(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('filter') filter?: DeviceFilter,
  ): Promise<GetBuilding> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    const message = await this.BuildingService.getBuildings(groupId, filter);

    return message;
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.LIGHTMAP),
  )
  @Query()
  async getLatLonByAddress(
    @Args('address') address: string,
  ): Promise<GPSPoint> {
    const message = await this.BuildingService.getLatLonByAddress(address);

    return message;
  }

  @Query()
  async searchDevicesForBuilding(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceId') deviceId: string,
    @Args('filter') filter?: DeviceFilterForBuilding,
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

    return this.BuildingService.searchDevicesForBuilding(
      groupId,
      deviceId,
      filter,
      size,
      after,
      before,
    );
  }

  @Mutation('createBuilding')
  async createBuilding(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('buildingInput') buildingInput: BuildingInput,
  ): Promise<string> {
    console.log('createBuilding');

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return 'PROJECTKEY NULL';

    return this.BuildingService.createBuilding(
      user,
      groupId,
      projectKey,
      buildingInput,
    );
  }

  @Mutation('updateBuilding')
  async updateBuilding(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceId') deviceId: string,
    @Args('buildingInput') buildingInput: BuildingInput,
  ): Promise<boolean> {
    console.log('updateBuilding');

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return false;

    return this.BuildingService.updateBuilding(
      user,
      groupId,
      deviceId,
      projectKey,
      buildingInput,
    );
  }

  @Mutation('deleteBuilding')
  async deleteBuilding(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceId') deviceId: string,
  ): Promise<boolean> {
    console.log('deleteBuilding');

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return false;

    return this.BuildingService.deleteBuilding(projectKey, groupId, deviceId);
  }

  @Mutation('updateFloorplan')
  async updateFloorplan(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceId') deviceId: string,
    @Args('floorNum') floorNum: string,
    @Args('imageId') newImageId: string,
  ): Promise<string> {
    console.log('---start updateFloorplan---');

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return 'PROJECTKEY NULL';

    if (
      deviceId === null ||
      deviceId === '' ||
      floorNum === null ||
      newImageId === null ||
      newImageId === ''
    ) {
      return 'deviceId ,floornum or imageId is empty.';
    }
    const oldImageId = await this.BuildingService.updateFloorplan(
      deviceId,
      floorNum,
      newImageId,
    );

    return oldImageId;
  }
}
