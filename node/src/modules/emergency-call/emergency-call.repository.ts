import { DeviceService } from '../device/device.service';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import { ConfigService } from '@nestjs/config';
import { GoogleClientService } from '../google-client/google-client/google-client.service';
import {
  EmergencyCallEvents,
  EmergencyCallEventsDocument,
} from 'src/models/emergency.call.events';
import {
  EmergencyCallContents,
  EmergencyCallContentsDocument,
} from 'src/models/emergency.call.contents';
import {
  EmergencyCallEventLogs,
  EmergencyCallEventLogsDocument,
} from 'src/models/emergency.call.event.logs';

@Injectable()
export class EmergencyCallDb {
  constructor(
    @InjectModel(EmergencyCallEvents.name)
    private readonly emergencyCallEventsModel: Model<EmergencyCallEventsDocument>,
    @InjectModel(EmergencyCallContents.name)
    private readonly emergencyCallContentsModel: Model<EmergencyCallContentsDocument>,
    @InjectModel(EmergencyCallEventLogs.name)
    private readonly emergencyCallEventLogsModel: Model<EmergencyCallEventLogsDocument>,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @Inject(forwardRef(() => DeviceService))
    private deviceService: DeviceService,
    @Inject(forwardRef(() => GroupService))
    private groupService: GroupService,
    private chtiotClientService: ChtiotClientService,
    private configService: ConfigService,
    private googleClientService: GoogleClientService,
  ) {}

  //mutation
  async addEmergencyCallEvent(event: EmergencyCallEvents): Promise<boolean> {
    await this.emergencyCallEventsModel.create(event);
    return true;
  }
  //query
}
