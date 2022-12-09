/* eslint-disable @typescript-eslint/no-unused-vars */
import { DeviceService } from '../device/device.service';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { ConfigService } from '@nestjs/config';
import { GoogleClientService } from '../google-client/google-client/google-client.service';
import {
  EmergencyCallEvents,
  EmergencyCallEventsDocument,
} from 'src/models/emergency.call.events';
import { EmergencyCallDb } from './emergency-call.repository';
import { EmergencyCallInput, User } from 'src/graphql.schema';

@Injectable()
export class EmergencyCallService {
  constructor(
    @InjectModel(EmergencyCallEvents.name)
    private readonly emergencyCallModel: Model<EmergencyCallEventsDocument>,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @Inject(forwardRef(() => DeviceService))
    private deviceService: DeviceService,
    @Inject(forwardRef(() => GroupService))
    private groupService: GroupService,
    private configService: ConfigService,
    private googleClientService: GoogleClientService,
    private emergencyCallEventDb: EmergencyCallDb,
  ) {}

  async checkEmergencyCallInput(
    user: User,
    groupId: string,
    projectKey: string,
    emergencyCallInput: EmergencyCallInput,
  ): Promise<boolean> {
    //檢查資料
    const event = new EmergencyCallEvents();
    await this.emergencyCallEventDb.addEmergencyCallEvent(event);
    return true;
  }

  async createEmergencyCallEvent(
    user: User,
    groupId: string,
    projectKey: string,
    emergencyCallInput: EmergencyCallInput,
  ): Promise<boolean> {
    //檢查資料
    const event = new EmergencyCallEvents();
    await this.emergencyCallEventDb.addEmergencyCallEvent(event);
    return true;
  }
}
