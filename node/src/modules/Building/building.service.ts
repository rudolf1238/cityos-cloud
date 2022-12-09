/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { DeviceService } from '../device/device.service';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DeviceStatus,
  DeviceType,
  GetBuilding,
  DeviceFilter,
  BuildingInput,
  BuildingEdge,
  GPSPoint,
  DeviceConnection,
  SortField,
  SortOrder,
  PageInfo,
  DeviceFilterForBuilding,
} from 'src/graphql.schema';
import { GroupService } from '../group/group.service';
import { ApolloError } from 'apollo-server-express';
import { ErrorCode } from 'src/models/error.code';
import { UserService } from '../user/user.service';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import {
  Building,
  GeoJSON,
  Attribute,
  BuildingDocument,
  DeviceDocument,
  Device,
} from 'src/models/device';
import { ConfigService } from '@nestjs/config';
import { GoogleClientService } from '../google-client/google-client/google-client.service';
import { User } from 'src/models/user';
import { ErrorEvent, ErrorLog, ErrorLogDocument } from 'src/models/errorlog';
import StringUtils from 'src/utils/StringUtils';

@Injectable()
export class BuildingService {
  constructor(
    @InjectModel(Building.name)
    private readonly buildingModel: Model<BuildingDocument>,
    @InjectModel(ErrorLog.name)
    private readonly erroeLogModel: Model<ErrorLogDocument>,
    @InjectModel(Device.name)
    private readonly deviceModel: Model<DeviceDocument>,
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

  private readonly logger = new Logger(BuildingService.name);

  async getBuildings(
    groupId: string,
    filter: DeviceFilter,
  ): Promise<GetBuilding> {
    //let queryAfterLimit;
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );
    let filterCondition = {};
    filterCondition = {
      $and: [
        filter && filter.deviceId != undefined
          ? {
              groups: { $in: ids },
              type: DeviceType.BUILDING,
              deviceId: filter.deviceId,
            }
          : { groups: { $in: ids }, type: DeviceType.BUILDING },
      ],
    };

    // if (filter && filter.deviceId != undefined) {
    //   queryAfterLimit = await this.buildingModel
    //     .find({
    //       type: DeviceType.BUILDING,

    //     })
    //     .populate({ path: 'groups', model: Group })
    //     .exec();
    // }
    // else {
    const queryAfterLimit = await this.buildingModel
      .find(filterCondition)
      .populate({ path: 'groups' })
      .populate({ path: 'floors.devices' })
      // .populate({
      //   path: 'floors',
      //   model: Floor.name,
      //   populate: {
      //     path: 'floors.devices',
      //     populate: { path: 'groups' },
      //   },
      // })

      .exec();
    //}
    const responseGetBuilding = new GetBuilding();
    const edges: BuildingEdge[] = [];

    for (const build of queryAfterLimit) {
      const edge = new BuildingEdge();
      edge.node = build.toApolloBuilding();
      let countTotalDevice = 0;
      console.log('---floor:', edge.node);
      // if (edge.node.floors) {
      edge.node.floors.flatMap((it) => {
        if (it.devices) {
          countTotalDevice += it.devices.length;
        }

        return countTotalDevice;
      });
      // }
      edge.deviceCount = countTotalDevice;
      edges.push(edge);
    }
    responseGetBuilding.edges = edges;
    // Tell user the possible rectangle on the map if they do not provide the gpsRectInput
    return responseGetBuilding;
  }

  async getLatLonByAddress(address: string): Promise<GPSPoint> {
    const addressresult = await this.googleClientService.getLatLonByAddress1(
      address,
    );

    // Tell user the possible rectangle on the map if they do not provide the gpsRectInput

    return addressresult;
  }

  async searchDevicesForBuilding(
    groupId: string,
    deviceId: string,
    filter?: DeviceFilterForBuilding,
    size?: number,
    after?: string,
    before?: string,
  ): Promise<DeviceConnection> {
    const type = this.configService.get<string>('DEVICE_TYPE_FOR_BUILDING');
    const typeArray = type.split(',');
    // console.log('---type:', typeArray);
    if (filter == undefined || filter == null) {
      filter = new DeviceFilterForBuilding();
    }
    const newTypes = typeArray.map((t) => {
      return { key: 'device_type', value: t };
    });
    filter.attribute = newTypes;
    const deviceData = await this.searchDevicesForBuildingFilter(
      groupId,
      deviceId,
      filter,
      typeArray,
      size,
      after,
      before,
    );
    return deviceData;
  }

  async searchDevicesForBuildingFilter(
    groupId: string,
    deviceId: string,
    filter?: DeviceFilterForBuilding,
    typeArray?: string[],
    size?: number,
    after?: string,
    before?: string,
  ): Promise<DeviceConnection> {
    // Find all group ids under this groupId include itself
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );

    const resBuilding = await this.buildingModel.findOne({
      deviceId: deviceId,
    });
    const idsStringArray = ids.map((x) => x.toString());
    const buildingList = [];
    for (const group of resBuilding.groups) {
      buildingList.push(group.id);
    }
    // const sb = new Set(buildingList);
    const intersect = idsStringArray.filter((x) =>
      new Set(buildingList).has(x),
    );
    // Build up the query for filter
    let filterCondition = {};
    const sortField = filter?.sortField ? filter.sortField : SortField.NAME;
    const sortOrder = filter?.sortOrder
      ? filter.sortOrder
      : SortOrder.ASCENDING;

    if (filter) {
      // const { type } = filter;
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
            : { groups: { $in: intersect } },
          // type ? { type } : {},
          status ? { status } : {},
          { usedForBuilding: { $in: [false, undefined] } }, //未被任何building使用過
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
                  $elemMatch: {
                    key: 'device_type',
                    value: { $in: typeArray },
                  },
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
      filterCondition = { groups: { $in: intersect } };
    }

    const edges = await this.deviceService.mongoQueryForDevices(
      size,
      filterCondition,
      sortField,
      sortOrder,
      before ? true : false,
      after || before,
    );

    // Save the devices into the connection
    const deviceConnection = new DeviceConnection();
    deviceConnection.edges = [];
    const pageInfo = new PageInfo();

    let index = 0;
    for (const edge of edges) {
      index += 1;
      if (index < size + 1) {
        deviceConnection.edges.push(edge);
      }
    }

    if (before) {
      deviceConnection.edges.reverse();

      pageInfo.hasPreviousPage = edges.length === size + 1;
      pageInfo.beforeCursor = deviceConnection.edges[0]?.cursor;

      pageInfo.endCursor =
        deviceConnection.edges[deviceConnection.edges.length - 1]?.cursor;
      if (pageInfo.endCursor) {
        const more = await this.deviceService.mongoQueryForDevices(
          size,
          filterCondition,
          sortField,
          sortOrder,
          false,
          pageInfo.endCursor,
        );
        pageInfo.hasNextPage = more.length > 0;
      } else {
        pageInfo.hasNextPage = false;
      }
    } else {
      pageInfo.hasNextPage = edges.length === size + 1;
      pageInfo.endCursor =
        deviceConnection.edges[deviceConnection.edges.length - 1]?.cursor;

      pageInfo.beforeCursor = deviceConnection.edges[0]?.cursor;
      if (pageInfo.beforeCursor) {
        const more = await this.deviceService.mongoQueryForDevices(
          size,
          filterCondition,
          sortField,
          sortOrder,
          true,
          pageInfo.beforeCursor,
        );
        pageInfo.hasPreviousPage = more.length > 0;
      } else {
        pageInfo.hasPreviousPage = false;
      }
    }

    deviceConnection.pageInfo = pageInfo;
    deviceConnection.totalCount = await this.deviceModel
      .find(filterCondition, null, { strictQuery: false })
      .countDocuments();

    return deviceConnection;
  }

  async createBuilding(
    user: User,
    groupId: string,
    projectKey: string,
    buildingInput: BuildingInput,
  ): Promise<string> {
    //chech input value
    if (!this.isValidBuildingInput(buildingInput)) {
      throw new ApolloError(
        'Please check the length of your inputs or device name is not empty.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }

    if (
      buildingInput.buildingType == undefined ||
      buildingInput.buildingType == null
    ) {
      buildingInput.buildingType = 'APARTMENT';
    }
    const attributes = new Attribute();
    attributes[0] = { key: 'device_type', value: 'building' };
    attributes[1] = {
      key: 'building_type',
      value: buildingInput.buildingType ?? 'APARTMENT',
    };
    attributes[2] = { key: 'x', value: buildingInput.x };
    attributes[3] = { key: 'y', value: buildingInput.y };
    attributes[4] = { key: 'degree', value: buildingInput.degree };

    // create device info in the CHT IOT platform
    const res = await this.chtiotClientService.createDevice(
      projectKey,
      buildingInput,
      attributes,
    );
    if (
      res.id == null ||
      res.id == undefined ||
      res == null ||
      res == undefined
    ) {
      const errorLog = new ErrorLog();
      errorLog.user = user;
      errorLog.event = ErrorEvent.IOT_CREATE_ERROR;
      errorLog.group = new Types.ObjectId(groupId);
      errorLog.result = 'Iot create faile.';
      await this.erroeLogModel.create(errorLog);
      throw new ApolloError(
        'Create fail:CHIIoT save error!',
        ErrorCode.CHTIOT_API_ERROR,
      );
    }
    const deviceId = res.id;

    const getTimezone = await this.googleClientService.getTimeZone(
      buildingInput.location.lat,
      buildingInput.location.lng,
    );
    const groupIdArray = [];
    groupIdArray.push(groupId);

    const floorArray = [];
    floorArray.push(buildingInput.floors);
    if (buildingInput.floors.length > 0) {
      for (const build of buildingInput.floors) {
        if (build.devices.length > 0 && build.devices[0].length > 0) {
          for (const deviceInFloor of build.devices) {
            await this.deviceModel.findByIdAndUpdate(
              new Types.ObjectId(deviceInFloor),
              {
                $set: {
                  usedForBuilding: true,
                },
              },
            );
          }
        }
      }
    }

    const att = [];
    att.push(attributes[0]);
    att.push(attributes[1]);
    if (attributes[2].value) {
      att.push(attributes[2]);
    }
    if (attributes[3].value) {
      att.push(attributes[3]);
    }
    if (attributes[4].value) {
      att.push(attributes[4]);
    }

    const newDevice = new Building();
    newDevice.deviceId = deviceId;
    newDevice.name = buildingInput.name;
    newDevice.desc = buildingInput.desc;
    newDevice.uri = '';
    newDevice.sensors = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    newDevice.groups = groupIdArray;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    newDevice.attributes = att;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    newDevice.floors = floorArray[0];
    if (buildingInput.location.lng && buildingInput.location.lat) {
      const location = new GeoJSON();
      const coordinates = [
        buildingInput.location.lng,
        buildingInput.location.lat,
      ];
      location.coordinates = coordinates;
      // ignore the invalid coordinates
      if (location.isValidCoordinates()) {
        newDevice.location = location;
      }
    }
    await Promise.all(
      this.getAddressLanguages().flatMap(async (language) => {
        const address = await this.googleClientService.addressLookup(
          language,
          buildingInput.location.lat,
          buildingInput.location.lng,
        );
        if (address !== null) newDevice.address.push(address);
        return true;
      }),
    );
    newDevice.type = DeviceType.BUILDING;
    newDevice.status = DeviceStatus.ACTIVE;
    newDevice.timezone = getTimezone;
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    console.log('add device' + newDevice);
    const buildingModel = await this.buildingModel.create(newDevice);
    if (!buildingModel) {
      await this.deviceService.deleteDevices(projectKey, groupId, [deviceId]);
      const errorLog2 = new ErrorLog();
      errorLog2.user = user;
      errorLog2.event = ErrorEvent.TRANSACTION_CREATE_ERROR;
      errorLog2.group = new Types.ObjectId(groupId);
      errorLog2.result = 'Mongo create faile.';
      await this.erroeLogModel.create(errorLog2);
      throw new ApolloError(
        'Create fail:Building save error!',
        ErrorCode.BUILDING_CREATE_ERROR,
      );
    }
    return newDevice.deviceId;
  }

  async updateBuilding(
    user: User,
    groupId: string,
    deviceId: string,
    projectKey: string,
    buildingInput: BuildingInput,
  ): Promise<boolean> {
    if (!this.isValidBuildingInput(buildingInput)) {
      throw new ApolloError(
        'Please check the length of your inputs or device name is not empty.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }
    if (
      buildingInput.buildingType == undefined ||
      buildingInput.buildingType == null
    ) {
      buildingInput.buildingType = 'APARTMENT';
    }
    //先將device usedForBuilding -> false
    const updateResBuilding = await this.buildingModel.findOne({
      deviceId: deviceId,
    });
    if (updateResBuilding.floors || updateResBuilding.floors.length > 0) {
      for (const f of updateResBuilding.floors) {
        if (f.devices.length > 0) {
          for (const deviceInFloor of f.devices) {
            await this.deviceModel.findByIdAndUpdate(deviceInFloor, {
              $set: {
                usedForBuilding: false,
              },
            });
          }
        }
      }
    }
    const attributes = new Attribute();
    attributes[0] = { key: 'device_type', value: 'building' };
    attributes[1] = {
      key: 'building_type',
      value: buildingInput.buildingType ?? 'APARTMENT',
    };
    attributes[2] = { key: 'x', value: buildingInput.x };
    attributes[3] = { key: 'y', value: buildingInput.y };
    attributes[4] = { key: 'degree', value: buildingInput.degree };
    // update device info in the CHT IOT platform
    if (projectKey === undefined) {
      for (const group of updateResBuilding.groups) {
        const groupRes = await this.groupService.getGroup(group.id);
        if (groupRes.projectKey) {
          projectKey = groupRes.projectKey;
        }
      }
    }

    const res = await this.chtiotClientService.updateDevice(
      projectKey,
      deviceId,
      buildingInput,
      attributes,
    );
    if (res.id == null || res == undefined) {
      const errorLog2 = new ErrorLog();
      errorLog2.user = user;
      errorLog2.event = ErrorEvent.IOT_UPDATE_ERROR;
      errorLog2.group = new Types.ObjectId(groupId);
      errorLog2.result = 'Iot update faile';
      await this.erroeLogModel.create(errorLog2);
      return false;
    }

    const getTimezone = await this.googleClientService.getTimeZone(
      buildingInput.location.lat,
      buildingInput.location.lng,
    );
    const resDevice = await this.deviceService.getDeviceById(deviceId);
    const groupIdArray = [];
    for (const a of resDevice.groups) {
      groupIdArray.push(a.id);
    }
    const floorArray = [];
    floorArray.push(buildingInput.floors);
    if (buildingInput.floors.length > 0) {
      for (const build of buildingInput.floors) {
        if (build.devices.length > 0) {
          for (const deviceInFloor of build.devices) {
            await this.deviceModel.findByIdAndUpdate(deviceInFloor, {
              $set: {
                usedForBuilding: true,
              },
            });
          }
        }
      }
    }
    const att = [];
    att.push(attributes[0]);
    att.push(attributes[1]);
    if (attributes[2].value) {
      att.push(attributes[2]);
    }
    if (attributes[3].value) {
      att.push(attributes[3]);
    }
    if (attributes[4].value) {
      att.push(attributes[4]);
    }
    const newDevice = new Building();
    newDevice.deviceId = deviceId;
    newDevice.name = buildingInput.name;
    newDevice.desc = buildingInput.desc;
    newDevice.uri = '';
    newDevice.sensors = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    newDevice.groups = groupIdArray;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    newDevice.attributes = att;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    newDevice.floors = floorArray[0];
    if (buildingInput.location.lng && buildingInput.location.lat) {
      const location = new GeoJSON();
      const coordinates = [
        buildingInput.location.lng,
        buildingInput.location.lat,
      ];
      location.coordinates = coordinates;
      // ignore the invalid coordinates
      if (location.isValidCoordinates()) {
        newDevice.location = location;
      }
    }
    await Promise.all(
      this.getAddressLanguages().flatMap(async (language) => {
        const address = await this.googleClientService.addressLookup(
          language,
          buildingInput.location.lat,
          buildingInput.location.lng,
        );
        if (address !== null) newDevice.address.push(address);
        return true;
      }),
    );
    newDevice.type = DeviceType.BUILDING;
    newDevice.status = DeviceStatus.ACTIVE;
    newDevice.timezone = getTimezone;

    const device = await this.deviceService.getDeviceById(deviceId);
    const deviceID = device._id;
    if (res !== null || res !== undefined) {
      await this.buildingModel.updateOne({ _id: deviceID }, newDevice);
      return true;
    }
    return false;
  }

  async deleteBuilding(
    projectKey: string,
    groupId: string,
    deviceId: string,
  ): Promise<boolean> {
    const device = await this.deviceService.getDeviceById(deviceId);
    if (device === null) {
      this.logger.warn(
        `Cannot delete the device ${deviceId} due to not existed in the database.`,
      );
      return;
    }
    const updateResBuilding = await this.buildingModel.findOne({
      deviceId: deviceId,
    });
    //拿取使用者所有group
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );
    const idsStringArray = ids.map((x) => x.toString());
    const buildingList = [];
    for (const group of updateResBuilding.groups) {
      buildingList.push(group.id);
    }
    const sb = new Set(buildingList);
    const intersect = idsStringArray.filter((x) => sb.has(x));
    // console.log('---group 交集:', intersect);
    let deleteTable: string[] = [];
    if (intersect.length > 0) {
      //先將building中的device usedForBuilding -> false
      if (updateResBuilding.floors || updateResBuilding.floors.length > 0) {
        for (const f of updateResBuilding.floors) {
          if (f.devices.length > 0) {
            for (const deviceInFloor of f.devices) {
              await this.deviceModel.findByIdAndUpdate(deviceInFloor, {
                $set: {
                  usedForBuilding: false,
                },
              });
            }
          }
        }
      }
      for (const mapId of intersect) {
        deleteTable = await this.deviceService.deleteDevices(
          projectKey,
          mapId,
          [deviceId],
        );
      }
    }
    if (deleteTable.length > 0 && deleteTable !== null) {
      return true;
    }
    return false;
  }

  async updateFloorplan(
    deviceId: string,
    floorNum: string,
    newImageId: string,
  ): Promise<string> {
    const device = await this.buildingModel.findOne({ deviceId: deviceId });
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    console.log('--finf one device--' + device);
    const floor = device.floors;
    let index = -1;

    if (floorNum == null) {
      return 'FloorNum is error!';
    } else {
      const out = floor.filter(async function (x) {
        if (x.floorNum == floorNum) {
          index = floor.indexOf(x);
          return x;
        }
      });
      console.log('----floor filter:' + out[index].id);
      const oldImageId = out[index].id;
      const filterCondition = {
        deviceId: deviceId,
        'floors.floorNum': floorNum,
      };
      await this.buildingModel.updateOne(filterCondition, {
        $set: { 'floors.$.id': newImageId },
      });
      return oldImageId;
    }
  }

  private isValidBuildingInput(buildingInput: BuildingInput): boolean {
    if (buildingInput.name !== undefined) {
      if (
        buildingInput.name.trim() === '' ||
        buildingInput.name === null ||
        buildingInput.name.length > 255
      ) {
        return false;
      }
    }
    if (buildingInput.floors.length == 0) {
      return false;
    }

    if (buildingInput.desc) {
      if (buildingInput.desc.length > 2000) {
        return false;
      }
    }

    return true;
  }

  private getAddressLanguages(): string[] {
    const languages = ['en'];
    const optionalLanguageString = this.configService.get<string>(
      'LANGUAGE_FOR_ADDRESSES_LOOK_UP',
    );

    if (optionalLanguageString) {
      const optionalLanguages = optionalLanguageString.split(',');
      optionalLanguages.forEach((language) => {
        languages.push(language);
      });
    }
    return languages;
  }
}
