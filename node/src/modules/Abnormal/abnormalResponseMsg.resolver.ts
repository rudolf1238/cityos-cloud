import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { AbnormalResponseMsgService } from './abnormalResponseMsg.service';

import { forwardRef, Inject, UseGuards } from '@nestjs/common';
import { ForbiddenError } from 'apollo-server-express';
import { User } from 'src/models/user';
import {
  Action,
  Subject,
  ResponseMSG_Merge_Connection,
  MessageboardInput,
  MessageboardInputSon,
  UpdateMessageboardInput,
  UpdateMessageboardSonInput,
  Response_MaintenanceUser,
} from 'src/graphql.schema';
import { CurrentUser } from '../auth/auth.decorator';
import { GroupService } from '../group/group.service';
import { AppAbility } from '../permission/ability.factory';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { LogService } from '../log/log.service';
import { DeviceService } from '../device/device.service';

@Resolver('ResponseMSG')
export class AbnormalResponseMsgResolver {
  constructor(
    @Inject(forwardRef(() => DeviceService))
    private readonly deviceService: DeviceService,
    private readonly abnormalResponseMsgService: AbnormalResponseMsgService,
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
  async getResponseMsg(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceIds') deviceIds: string[],
    @Args('page') page: number,
    @Args('size') size: number,
  ): Promise<ResponseMSG_Merge_Connection> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    const message = await this.abnormalResponseMsgService.getResponseMsg(
      groupId,
      deviceIds,
      page,
      size,
    );

    const messageSon = await this.abnormalResponseMsgService.getResponseMsg_Son(
      message,
    );
    return messageSon;
  }

  @Query()
  async getMaintenanceUser(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceId') deviceId: string,
  ): Promise<Response_MaintenanceUser> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    const deviceID = (await this.deviceService.getDeviceById(deviceId))._id;
    const message = await this.abnormalResponseMsgService.getMaintenanceUser(
      groupId,
      deviceID,
    );

    return message;
  }

  @Mutation()
  async addMessageboard(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('MessageboardInput') messageboardInput: MessageboardInput,
  ): Promise<boolean> {
    // permission check: 'groupId' must under user's current division

    // if (!(await this.groupService.isGroupUnder(user, groupId))) {
    //   throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    // }

    // log
    // const log = new Log(
    //   user,
    //   UserEvent.ADD_MESSAGEBOARD,
    //   groupId,
    // messageboardInput,
    // );
    // await this.logService.insertEvent(log);

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return false;

    if (messageboardInput.status.length != 0) {
      void this.deviceService.updateDeviceMaintainStatus(
        groupId,
        messageboardInput.deviceId,
        messageboardInput.status,
      );
    }
    return this.abnormalResponseMsgService.addMessageboard(
      projectKey,
      groupId,
      messageboardInput,
    );
  }

  @Mutation('addMessageboardSon')
  async addMessageboardSon(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('MessageboardInputSon') messageboardInputSon: MessageboardInputSon,
  ): Promise<boolean> {
    // permission check: 'groupId' must under user's current division

    // if (!(await this.groupService.isGroupUnder(user, groupId))) {
    //   throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    // }
    // log
    // const log = new Log(
    //   user,
    //   UserEvent.ADD_MESSAGEBOARD,
    //   groupId,
    // messageboardInput,
    // );
    // await this.logService.insertEvent(log);

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return false;

    if (messageboardInputSon.status.length != 0) {
      void this.deviceService.updateDeviceMaintainStatus(
        groupId,
        messageboardInputSon.deviceId,
        messageboardInputSon.status,
      );
    }

    // const oldContent = this.AbnormalResponseMsgService.findMsgbyId();

    return this.abnormalResponseMsgService.addMessageboardSon(
      projectKey,
      groupId,
      messageboardInputSon,
    );
  }

  @Mutation('updateMessageboard')
  async updateMessageboard(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('UpdateMessageboardInput')
    updateMessageboardInput: UpdateMessageboardInput,
  ): Promise<boolean> {
    // permission check: 'groupId' must under user's current division

    // if (!(await this.groupService.isGroupUnder(user, groupId))) {
    //   throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    // }
    // log
    // const log = new Log(
    //   user,
    //   UserEvent.ADD_MESSAGEBOARD,
    //   groupId,
    // messageboardInput,
    // );
    // await this.logService.insertEvent(log);

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return false;

    if (updateMessageboardInput.status.length != 0) {
      void this.deviceService.updateDeviceMaintainStatus(
        groupId,
        updateMessageboardInput.deviceId,
        updateMessageboardInput.status,
      );
    }

    // const oldContent = this.AbnormalResponseMsgService.findMsgbyId();

    return this.abnormalResponseMsgService.updateMessageboard(
      projectKey,
      groupId,
      updateMessageboardInput,
    );
  }

  @Mutation('updateMessageboardSon')
  async updateMessageboardSon(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('UpdateMessageboardSonInput')
    updateMessageboardSonInput: UpdateMessageboardSonInput,
  ): Promise<boolean> {
    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return false;

    if (updateMessageboardSonInput.status.length != 0) {
      void this.deviceService.updateDeviceMaintainStatus(
        groupId,
        updateMessageboardSonInput.deviceId,
        updateMessageboardSonInput.status,
      );
    }
    return this.abnormalResponseMsgService.updateMessageboardSon(
      projectKey,
      groupId,
      updateMessageboardSonInput,
    );
  }

  @Mutation('deleteMessageboard')
  async deleteMessageboard(
    @Args('groupId') groupId: string,
    @Args('id') id: string,
  ): Promise<boolean> {
    // const { projectKey } = await this.groupService.getGroup(groupId);
    // if (projectKey === null) return false;
    console.log('<1>remove id:' + id);
    return this.abnormalResponseMsgService.deleteMessageboard(id);
  }

  @Mutation('deleteMessageboardSon')
  async deleteMessageboardSon(
    @Args('groupId') groupId: string,
    @Args('id') id: string,
  ): Promise<boolean> {
    // const { projectKey } = await this.groupService.getGroup(groupId);
    // if (projectKey === null) return false;
    console.log('<1>remove id:' + id);
    return this.abnormalResponseMsgService.deleteMessageboardSon(id);
  }
}
