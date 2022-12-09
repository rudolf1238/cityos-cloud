import { DeviceService } from '../device/device.service';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Device, DeviceDocument } from 'src/models/device';
import {
  DeviceConnection,
  DeviceFilter,
  Maintenance_devicelistConnection,
  Maintenance_devicelistGroup,
  Maintenance_devicelistEdge,
  AddDeviceConnection,
  DeviceType,
  DeviceStatus,
  DeviceEdge,
} from 'src/graphql.schema';
import { ErrorCode } from 'src/models/error.code';
import { ApolloError } from 'apollo-server-express';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { Model, Types } from 'mongoose';
import {
  MaintenanceStaff,
  MaintenanceStaffDocument,
} from 'src/models/maintenance_staff';
import { User, UserDocument } from 'src/models/user';
import StringUtils from 'src/utils/StringUtils';

@Injectable()
export class MaintenanceStaffService {
  constructor(
    @InjectModel(MaintenanceStaff.name)
    private readonly Maintenance_staffModel: Model<MaintenanceStaffDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Device.name)
    private readonly deviceModel: Model<DeviceDocument>,

    @Inject(forwardRef(() => GroupService))
    private groupService: GroupService,
    @Inject(forwardRef(() => UserService))
    private userService: UserService,
    @Inject(forwardRef(() => DeviceService))
    private deviceService: DeviceService,
  ) {}

  private readonly logger = new Logger(MaintenanceStaffService.name);

  async getMaintenanceDevicelist(
    groupId: string,
    userId: string,
    filter?: DeviceFilter,
    size?: number,
    after?: string,
  ): Promise<Maintenance_devicelistConnection> {
    this.logger.log('groupId:' + groupId);
    let queryAfterLimit = await this.Maintenance_staffModel.find({
      userId: userId,
    }).exec();

    if (!(queryAfterLimit.length == 0)) {
      queryAfterLimit = await this.Maintenance_staffModel.find({
        userId: userId,
      })
        .populate({ path: 'device' })
        .exec();
    }
    const drvicearr: string[] = [];
    if (!(queryAfterLimit.length == 0)) {
      for (let x = 0; x < queryAfterLimit[0].device.length; x++) {
        drvicearr[x] = queryAfterLimit[0].device[x].deviceId.toString();
      }
    }
    const devices: DeviceConnection =
      await this.deviceService.searchDevicesbystaff(
        drvicearr,
        groupId,
        filter,
        size,
        after,
      );
    // const adddevices: DeviceConnection =
    //   await this.deviceService.searchAddDevicesbystaff(
    //     drvicearr,
    //     groupId,
    //     filter,
    //     size,
    //     after,
    //   );
    // adddevices.edges = devices.edges.concat(adddevices.edges);
    //const device = devices.flatMap((it) => it.toApolloDevice());
    const edges: Maintenance_devicelistEdge[] = [];

    queryAfterLimit.forEach((Maintenancestaff) => {
      const edge = new Maintenance_devicelistEdge();
      edge.node = Maintenancestaff.toApolloMaintenanceStaff();
      edge.cursor = Maintenancestaff._id as string;
      edge.device = devices;
      //edge.adddevice = adddevices;
      edges.push(edge);
    });

    const maintenanceDevicelist = new Maintenance_devicelistConnection();
    maintenanceDevicelist.edges = edges;
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );

    const idsnames = [];
    const groups = [] as Maintenance_devicelistGroup[];

    for (const x of ids) {
      const group = await this.groupService.getGroup(x.toString());
      idsnames.push(group.name);
      const MaintenanceDevicelistgroup = new Maintenance_devicelistGroup();
      MaintenanceDevicelistgroup.id = x.toString();
      MaintenanceDevicelistgroup.value = group.name;
      MaintenanceDevicelistgroup.label = group.name;
      groups.push(MaintenanceDevicelistgroup);
    }
    maintenanceDevicelist.groups = groups;
    return maintenanceDevicelist;
  }

  async deleteStaffs(
    projectKey: string,
    groupId: string,
    userIds: string[],
  ): Promise<string[]> {
    const deletable: string[] = [];
    await Promise.all(
      userIds.flatMap(async (userId) => {
        const user = await this.userService.getUserById(userId);
        if (user === null) {
          throw new ApolloError(
            `Cannot find - ${userId} in the database.`,
            ErrorCode.DEVICE_NOT_FOUND,
          );
        }

        // this device's groups is empty
        await this.userModel.findByIdAndUpdate(user._id, {
          $set: {
            isMaintenance: false,
          },
        });

        deletable.push(userId);
      }),
    );

    return deletable;
  }

  async searchAddDevicesbystaff(
    groupId: string,
    userId: string,
    filter?: DeviceFilter,
  ): Promise<AddDeviceConnection> {
    // Find all group ids under this groupId include itself
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );

    let queryAfterLimit = await this.Maintenance_staffModel.find({
      userId: userId,
    }).exec();

    if (!(queryAfterLimit.length == 0)) {
      queryAfterLimit = await this.Maintenance_staffModel.find({
        userId: userId,
      })
        .populate({ path: 'device' })
        .exec();
    }

    const drvicearr: string[] = [];
    if (!(queryAfterLimit.length == 0)) {
      for (let x = 0; x < queryAfterLimit[0].device.length; x++) {
        drvicearr[x] = queryAfterLimit[0].device[x].deviceId.toString();
      }
    }

    // Build up the query for filter
    let filterCondition = {};
    let filterConditionAdd = {};
    if (filter) {
      const { type } = filter;
      const { status } = filter;
      const { enableSchedule } = filter;
      const { keyword } = filter;
      const { attribute } = filter;
      const { isDevicesUnderLampActive } = filter;
      const { disabled } = filter;
      const regKeyword = new RegExp(StringUtils.escapeRegExp(keyword), 'i');
      const gpsRect = filter.gpsRectInput;
      filterCondition = {
        $and: [
          disabled === true
            ? {
                disabledGroups: {
                  $elemMatch: { ids: new Types.ObjectId(groupId) },
                },
              }
            : { groups: { $in: ids } },
          type ? { type } : {},
          { deviceId: { $in: drvicearr } },
          status ? { status } : {},
          enableSchedule !== undefined
            ? {
                'lightSchedule.manualSchedule.enableManualSchedule':
                  enableSchedule,
              }
            : {},

          gpsRect
            ? {
                location: {
                  $geoWithin: {
                    $geometry: {
                      type: 'Polygon',
                      coordinates: [
                        [
                          [gpsRect.sw.lng, gpsRect.sw.lat],
                          [gpsRect.sw.lng, gpsRect.ne.lat],
                          [gpsRect.ne.lng, gpsRect.ne.lat],
                          [gpsRect.ne.lng, gpsRect.sw.lat],
                          [gpsRect.sw.lng, gpsRect.sw.lat],
                        ],
                      ],
                    },
                  },
                },
              }
            : {},

          {
            $or: [
              { deviceId: { $regex: regKeyword } },
              { name: { $regex: regKeyword } },
              { desc: { $regex: regKeyword } },
              { 'attributes.key': { $regex: regKeyword } },
              { 'attributes.value': { $regex: regKeyword } },
              { 'address.detail.country': { $regex: regKeyword } },
              { 'address.detail.city': { $regex: regKeyword } },
              { 'address.detail.formattedAddress': { $regex: regKeyword } },
            ],
          },
          attribute
            ? {
                attributes: {
                  $elemMatch: { key: attribute.key, value: attribute.value },
                },
              }
            : {},
          isDevicesUnderLampActive === true
            ? {
                $and: [
                  { type: DeviceType.LAMP },
                  {
                    $and: [
                      { status: DeviceStatus.ACTIVE },
                      { relatedStatus: DeviceStatus.ACTIVE },
                    ],
                  },
                ],
              }
            : {},
          isDevicesUnderLampActive === false
            ? {
                $and: [
                  { type: DeviceType.LAMP },
                  {
                    $or: [
                      { status: DeviceStatus.ERROR },
                      { relatedStatus: DeviceStatus.ERROR },
                    ],
                  },
                ],
              }
            : {},
        ],
      };
      filterConditionAdd = {
        $and: [
          disabled === true
            ? {
                disabledGroups: {
                  $elemMatch: { ids: new Types.ObjectId(groupId) },
                },
              }
            : { groups: { $in: ids } },
          type ? { type } : {},
          { deviceId: { $nin: drvicearr } },
          status ? { status } : {},
          enableSchedule !== undefined
            ? {
                'lightSchedule.manualSchedule.enableManualSchedule':
                  enableSchedule,
              }
            : {},

          gpsRect
            ? {
                location: {
                  $geoWithin: {
                    $geometry: {
                      type: 'Polygon',
                      coordinates: [
                        [
                          [gpsRect.sw.lng, gpsRect.sw.lat],
                          [gpsRect.sw.lng, gpsRect.ne.lat],
                          [gpsRect.ne.lng, gpsRect.ne.lat],
                          [gpsRect.ne.lng, gpsRect.sw.lat],
                          [gpsRect.sw.lng, gpsRect.sw.lat],
                        ],
                      ],
                    },
                  },
                },
              }
            : {},

          {
            $or: [
              { deviceId: { $regex: regKeyword } },
              { name: { $regex: regKeyword } },
              { desc: { $regex: regKeyword } },
              { 'attributes.key': { $regex: regKeyword } },
              { 'attributes.value': { $regex: regKeyword } },
              { 'address.detail.country': { $regex: regKeyword } },
              { 'address.detail.city': { $regex: regKeyword } },
              { 'address.detail.formattedAddress': { $regex: regKeyword } },
            ],
          },
          attribute
            ? {
                attributes: {
                  $elemMatch: { key: attribute.key, value: attribute.value },
                },
              }
            : {},
          isDevicesUnderLampActive === true
            ? {
                $and: [
                  { type: DeviceType.LAMP },
                  {
                    $and: [
                      { status: DeviceStatus.ACTIVE },
                      { relatedStatus: DeviceStatus.ACTIVE },
                    ],
                  },
                ],
              }
            : {},
          isDevicesUnderLampActive === false
            ? {
                $and: [
                  { type: DeviceType.LAMP },
                  {
                    $or: [
                      { status: DeviceStatus.ERROR },
                      { relatedStatus: DeviceStatus.ERROR },
                    ],
                  },
                ],
              }
            : {},
        ],
      };
    } else {
      filterCondition = { groups: { $in: ids } };
      filterConditionAdd = { groups: { $in: ids } };
    }

    const edges = await this.mongoQueryForAddDevices(filterCondition);
    const edgesAdd = await this.mongoQueryForAddDevices(filterConditionAdd);
    const adddeviceConnection = new AddDeviceConnection();
    adddeviceConnection.edges = edges.concat(edgesAdd);
    adddeviceConnection.device = edges;
    // adddeviceConnection.totalCount = await this.deviceModel
    //   .find(filterCondition, null, { strictQuery: false })
    //   .countDocuments();

    adddeviceConnection.totalCount = edgesAdd.concat(edges).length;

    return adddeviceConnection;
  }

  private async mongoQueryForAddDevices(
    filterCondition: any,
  ): Promise<DeviceEdge[]> {
    let mainCondition = {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    mainCondition = filterCondition;
    const queryAfterLimit = await this.deviceModel
      .find(mainCondition, null, { strictQuery: false })
      .populate({ path: 'groups' })
      .populate({ path: 'sensors' });

    const edges = queryAfterLimit.flatMap((device) => {
      const edge = new DeviceEdge();
      edge.node = device.toApolloDevice();
      edge.cursor = device._id as string;
      return edge;
    });

    return edges;
  }

  async addDevicesStaff(
    groupId: string,
    deviceIds: string[],
    userId: string,
  ): Promise<boolean> {
    const maintenanceStaff = await this.getMaintenanceDevicelistByUserId(
      userId,
    );
    const addDevicelist = new MaintenanceStaff();
    const devicelist = await this.getDevice(deviceIds);
    addDevicelist.device = devicelist;

    if (maintenanceStaff) {
      await this.Maintenance_staffModel.findByIdAndUpdate(
        maintenanceStaff._id,
        addDevicelist,
      );
    } else {
      addDevicelist.userId = userId;
      await this.Maintenance_staffModel.create(addDevicelist);
    }

    return true;
  }

  async getDevice(deviceId: string[]): Promise<Device[]> {
    return this.deviceModel.find({ deviceId: { $in: deviceId } });
  }

  async getMaintenanceDevicelistByUserId(
    userId: string,
  ): Promise<MaintenanceStaff> {
    return this.Maintenance_staffModel.findOne({
      userId: userId,
    }).populate({ path: 'device' });
  }

  async deleteStaffDevices(
    groupId: string,
    deviceIds: string[],
    userId: string,
  ): Promise<string[]> {
    const maintenanceStaff = await this.getMaintenanceDevicelistByUserId(
      userId,
    );

    // const deviceForMaintenanceStaff = maintenanceStaff.device.flatMap((it) =>
    //   it._id.toHexString(),
    // );
    const devicelist = await this.getDevice(deviceIds);
    const devicelistId = devicelist.flatMap((it) => it._id.toHexString());

    await this.Maintenance_staffModel.findByIdAndUpdate(maintenanceStaff._id, {
      $set: {
        device: maintenanceStaff.device,
      },
      //$pull: { device: { $in: devicelistId } },
    });
    // await Promise.all(
    //   devicelistId.flatMap(async (deviceId) => {
    //     const index = deviceForMaintenanceStaff.indexOf(deviceId);
    //     if (index > -1) {
    //       maintenanceStaff.device.splice(index, 1);
    //       // this.logger.debug(
    //       //   `Remove ${groupId} from device[${deviceId}] => groups = ${JSON.stringify(
    //       //     maintenanceStaff.device,
    //       //   )}`,
    //       // );

    //       await this.Maintenance_staffModel.findByIdAndUpdate(
    //         maintenanceStaff._id,
    //         {
    //           // $set: {
    //           //   device: maintenanceStaff.device,
    //           // },
    //           $pull: { device: deviceId },
    //         },
    //       );
    //       deletable.push(deviceId);
    //     }
    //   }),
    // );

    return devicelistId;
  }
}
