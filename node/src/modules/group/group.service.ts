import {
  forwardRef,
  Inject,
  Logger,
  OnModuleInit,
  Injectable,
} from '@nestjs/common';
import { ApolloError } from 'apollo-server-express';
import { ErrorCode } from 'src/models/error.code';
import {
  Group,
  GroupDocument,
  SensorMask,
  SensorMaskInfo,
} from 'src/models/group';
import {
  CreateGroupInput,
  DeviceType,
  EditGroupInput,
  Level,
} from 'src/graphql.schema';
import { Sensor } from 'src/models/sensor';
import { Constants } from 'src/constants';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/models/user';
import { Model, Types } from 'mongoose';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import { DeviceService } from '../device/device.service';
import { UserService } from '../user/user.service';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class GroupService implements OnModuleInit {
  constructor(
    @InjectModel(Group.name)
    private readonly groupModel: Model<GroupDocument>,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @Inject(forwardRef(() => DeviceService))
    private readonly deviceService: DeviceService,
    private readonly chtiotClientService: ChtiotClientService,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(GroupService.name);

  async onModuleInit() {
    // initialize for the root group
    const group = await this.getRootGroup();

    // initialize for the root user
    const user = await this.userService.initialize(group);
    this.logger.log(`The root user would be ${user.email}`);
  }

  async create(createGroupInput: CreateGroupInput): Promise<Group> {
    // the max length of group name is 255
    if (!this.isValidGroupName(createGroupInput.name)) {
      throw new ApolloError(
        'Please check the length of your inputs.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }
    // check the existence of the parent group
    const parentGroup = await this.getGroup(createGroupInput.parentGroupId);
    if (parentGroup === null) {
      throw new ApolloError(
        `Cannot find ${createGroupInput.parentGroupId} in the database.`,
        ErrorCode.GROUP_NOT_FOUND,
      );
    }
    this.logger.log(`Create group by ${JSON.stringify(createGroupInput)}`);

    // if division level for than DEEPEST_LEVEL_FOR_GROUPS, throw the error message
    if (
      parentGroup.ancestors.length + 1 >=
      Constants.DEEPEST_LEVEL_FOR_GROUPS
    ) {
      throw new ApolloError(
        `Cannot create group ${createGroupInput.name}, cause the maximum level for groups is ${Constants.DEEPEST_LEVEL_FOR_GROUPS}.`,
        ErrorCode.GROUP_LEVEL_LIMIT_REACH,
      );
    }

    // create the group on the database
    const childGroup = new Group();
    childGroup.name = createGroupInput.name;
    if (parentGroup) {
      childGroup.parent = parentGroup._id;
      const ancestorIds = parentGroup.ancestors;
      ancestorIds.push(childGroup.parent);
      childGroup.ancestors = ancestorIds;

      if (parentGroup.ancestors.length === 1) {
        // Create the project in CHT IOT and get the new projetcKey if in PROJECT level
        const data = await this.chtiotClientService.createProject(
          createGroupInput.name,
        );
        [childGroup.projectId, childGroup.projectKey] = data;
      } else {
        // Using the parnet's projectKey if not in PROJECT level
        childGroup.projectKey = parentGroup.projectKey;
      }
      childGroup.sensorMask = new SensorMask();
    }

    return this.groupModel.create(childGroup);
  }

  async getGroup(groupId: string): Promise<Group> {
    return this.groupModel.findOne({ _id: groupId });
  }

  async searchGroups(user: User): Promise<Group[]> {
    const start = Date.now();
    const groupIds = new Set<string>();

    // Find out the group that inUse is true, and list all its descendants
    const userGroup = user.groupInUse();
    groupIds.add(userGroup._id.toHexString());
    const descendants = await this.groupModel.find({
      ancestors: userGroup._id,
    });
    await Promise.all(
      descendants.flatMap(async (it) => {
        groupIds.add(it._id as string);
      }),
    );

    // Get the group detail for these groupIds
    const groups = await this.groupModel.find({
      _id: { $in: Array.from(groupIds.values()) },
    });

    const end = Date.now();
    this.logger.debug(`Spend: ${end - start} ms.`);
    return groups;
  }

  /* eslint no-param-reassign: ["error", { "props": false }] */
  async editGroup(
    group: Group,
    level: Level,
    editGroupInput: EditGroupInput,
  ): Promise<boolean> {
    // the max length of group name is 255
    if (!this.isValidGroupName(editGroupInput.name)) {
      throw new ApolloError(
        'Please check the length of your inputs.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }

    if (group === null) {
      throw new ApolloError(
        `Cannot find this group in the database.`,
        ErrorCode.GROUP_NOT_FOUND,
      );
    }
    this.logger.log(
      `Edit group[${group._id.toHexString()}], input = ${JSON.stringify(
        editGroupInput,
      )}`,
    );

    if (editGroupInput.name !== undefined) group.name = editGroupInput.name;
    if (editGroupInput.sensorMaskInput !== undefined) {
      const sensorMask = group.sensorMask ? group.sensorMask : new SensorMask();
      if (editGroupInput.sensorMaskInput.enable !== undefined)
        sensorMask.enable = editGroupInput.sensorMaskInput.enable;
      if (editGroupInput.sensorMaskInput.sensors !== undefined) {
        sensorMask.sensors = editGroupInput.sensorMaskInput.sensors.flatMap(
          (it) => {
            const info = new SensorMaskInfo();
            info.deviceType = it.deviceType;
            info.sensorId = it.sensorId;
            return info;
          },
        );
      }

      group.sensorMask = sensorMask;
    }

    // edit the project name in the CHT IOT
    if (level === Level.PROJECT) {
      const { projectId } = group;
      await this.chtiotClientService.editProjectName(projectId, group.name);
    }

    return !!(await this.groupModel.updateOne({ _id: group._id }, group));
  }

  async deleteGroup(
    deleter: User,
    group: Group,
    level: Level,
  ): Promise<boolean> {
    const groupId = group._id.toHexString();
    const userGroup = deleter.groupInUse();
    this.logger.log(
      `User[${deleter.email}-${deleter.name}] deletes group[${group.name}] at level ${level}`,
    );

    // cannot delete a group you are using or a group has any subGroups
    const subGroups = await this.getDirectChilds(group._id);
    if (userGroup._id.toHexString() === groupId || subGroups.length !== 0) {
      throw new ApolloError(
        'You cannot delete a group you are using or a group has any subGroups.',
        ErrorCode.GROUP_DELETE_FAIL,
      );
    }

    // remove all users from the group
    await this.userService.removeUsersFrom(deleter, groupId);

    // remove all devices from the group
    await this.deviceService.removeDeviceFrom(group.projectKey, groupId);

    // delete the project from IOT if group is Level.PROJECT
    if (level === Level.PROJECT) {
      const { projectId } = group;
      await this.chtiotClientService.deleteProject(projectId);
    }

    // delete the group in the cityos
    return !!(await this.groupModel.findByIdAndDelete(groupId));
  }

  async getDirectChilds(parentId: Types.ObjectId): Promise<Types.ObjectId[]> {
    return (await this.groupModel.find({ parent: parentId })).flatMap((it) => {
      return new Types.ObjectId(it._id as string);
    });
  }

  async getAllChilds(
    ancestorId: Types.ObjectId,
    includeSelf: boolean,
  ): Promise<Types.ObjectId[]> {
    const ids = (await this.groupModel.find({ ancestors: ancestorId })).flatMap(
      (it) => {
        return new Types.ObjectId(it._id as string);
      },
    );

    if (includeSelf) {
      ids.unshift(ancestorId);
    }

    return ids;
  }

  // number of devices under this group and all subgroups
  async getDeviceCount(groupdId: Types.ObjectId): Promise<number> {
    return this.deviceService.getDeviceCount(groupdId.toHexString());
  }

  // number of users under this group only
  async getUserCount(groupdId: Types.ObjectId): Promise<number> {
    return this.userService.getUserCount(groupdId);
  }

  async getSensors(
    groupId: string,
    deviceType?: DeviceType,
    deviceIds?: string[],
  ): Promise<Sensor[]> {
    return this.deviceService.getSensorsUnderGroup(
      groupId,
      deviceType,
      deviceIds,
    );
  }

  async isGroupUnder(user: User, groupId: string): Promise<boolean> {
    const groupInUse = user.groupInUse();
    const groups = await this.getAllChilds(groupInUse._id, true);
    return groups.flatMap((it) => it.toHexString()).includes(groupId);
  }

  async gorupsForProjectLevel(): Promise<Group[]> {
    const rootGroup = await this.getRootGroup();

    return this.groupModel.find({
      parent: rootGroup?._id,
    });
  }

  async getRootGroup(): Promise<Group> {
    const rootGroup = await this.groupModel.findOne({
      ancestors: [],
    });

    if (rootGroup) {
      return rootGroup;
    } else {
      const group = new Group();
      const sensorMask = new SensorMask();
      group.name = this.configService.get<string>('ROOT_GROUP_NAME');
      group.sensorMask = sensorMask;

      this.logger.log(
        `There is no group in the CityOS, and create it automatically: ${JSON.stringify(
          group,
        )}`,
      );
      return this.groupModel.create(group);
    }
  }

  private isValidGroupName(name?: string): boolean {
    if (name) {
      if (name.length > 200) {
        return false;
      }
    }
    return true;
  }
}
