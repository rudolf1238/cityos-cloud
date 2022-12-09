import { UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Args, Mutation, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { ApolloError, ForbiddenError } from 'apollo-server-express';
import {
  Action,
  CameraEventConnection,
  CameraEventFilter,
  RecognitionType,
  CarIdentifyEvent,
  GetVideoHistoryPayload,
  GetVideoURLPayload,
  HumanFlowAdvanceEvent,
  HumanShapeEvent,
  ICameraEvent,
  KeepVideoAlivePayload,
  LiveViewConfigInput,
  Subject,
} from 'src/graphql.schema';
import { ErrorCode } from 'src/models/error.code';
import { LiveViewConfig } from 'src/models/liveview';
import { User } from 'src/models/user';
import { CurrentUser } from '../auth/auth.decorator';
import { DeviceService } from '../device/device.service';
import { GroupService } from '../group/group.service';
import { AppAbility } from '../permission/ability.factory';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { CameraService } from './camera.service';

@Resolver('Camera')
export class CameraResolver {
  constructor(
    private readonly cameraService: CameraService,
    private readonly deviceService: DeviceService,
    private readonly configService: ConfigService,
    private readonly groupService: GroupService,
  ) {}

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.LIGHTMAP) ||
      ability.can(Action.VIEW, Subject.IVS_SURVEILLANCE),
  )
  @Query()
  async getVideoURL(
    @CurrentUser() user: User,
    @Args('deviceIds') deviceIds: string[],
  ): Promise<GetVideoURLPayload> {
    // permission check: 'deviceIds' must under user's current division
    const device = await this.deviceService.getDeviceByIds(deviceIds);
    if (!(await this.deviceService.isDevicesUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to access these camera ${JSON.stringify(
          deviceIds,
        )}.`,
      );
    }

    return this.cameraService.getVideoURL(deviceIds);
  }

  @Mutation()
  async keepVideoAlive(
    @Args('token') token: string,
    @Args('urlTokenList') urlTokenList: string[],
  ): Promise<KeepVideoAlivePayload> {
    return this.cameraService.keepVideoAlive(token, urlTokenList);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.DASHBOARD),
  )
  @Query()
  async getVideoHistory(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('from') from: Date,
    @Args('to') to: Date,
  ): Promise<GetVideoHistoryPayload> {
    // permission check: 'deviceId' must under user's current division
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to access this camera ${device?.deviceId}.`,
      );
    }

    return this.cameraService.getVideoHistory(device, from, to);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.IVS_SURVEILLANCE),
  )
  @Query()
  async readLiveViewConfig(@CurrentUser() user: User): Promise<LiveViewConfig> {
    return this.cameraService.readLiveViewConfig(user);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.IVS_SURVEILLANCE),
  )
  @Mutation()
  async saveLiveViewConfig(
    @CurrentUser() user: User,
    @Args('input') input: LiveViewConfigInput,
  ): Promise<LiveViewConfig> {
    return this.cameraService.saveLiveViewConfig(user, input);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.IVS_EVENTS),
  )
  @Query()
  async cameraEventHistory(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('filter') filter: CameraEventFilter,
    @Args('size') size?: number,
    @Args('after') after?: string,
    @Args('before') before?: string,
  ): Promise<CameraEventConnection> {
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

    return this.cameraService.cameraEventHistory(
      groupId,
      filter,
      size,
      after,
      before,
    );
  }
}

@Resolver('ICameraEvent')
export class CameraEventResolver {
  @ResolveField()
  __resolveType(obj: ICameraEvent) {
    switch (obj.type) {
      case RecognitionType.HUMAN_SHAPE:
        return HumanShapeEvent.name;
      case RecognitionType.CAR_IDENTIFY:
        return CarIdentifyEvent.name;
      case RecognitionType.HUMAN_FLOW_ADVANCE:
        return HumanFlowAdvanceEvent.name;
      default:
        throw new ApolloError(
          `Cannot the resolve ${obj.type} for CameraEventResolver.`,
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
    }
  }
}
