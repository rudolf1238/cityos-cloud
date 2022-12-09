import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Attribute, Device, GeoJSON, DeviceDocument } from 'src/models/device';
import { DisabledGroup } from 'src/models/group';
import {
  DeviceConnection,
  DeviceEdge,
  DeviceFilter,
  DeviceType,
  EditDeviceInput,
  GPSPoint,
  GPSRect,
  PageInfo,
  SortField,
  SortOrder,
  Device as ApolloDevice,
  DeviceStatus,
  MapClusters,
  DevicesCluster,
  MapDevices,
  MapDeviceFilter,
} from 'src/graphql.schema';
import { Lamp, LampDocument } from 'src/models/lamp';
import { Sensor } from 'src/models/sensor';
import { ErrorCode } from 'src/models/error.code';
import { ApolloError } from 'apollo-server-express';
import { Constants } from 'src/constants';
import ActiveSettingUtils from 'src/utils/ActiveSettingUtils';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/models/user';
import StringUtils from 'src/utils/StringUtils';
import { GeoJsonProperties } from 'geojson';
import Supercluster = require('supercluster');
import { Document, Model, ObjectId, Types } from 'mongoose';
import { GoogleClientService } from '../google-client/google-client/google-client.service';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import { SensorService } from '../sensor/sensor.service';
import { GroupService } from '../group/group.service';
import { LampService } from '../lamp/lamp.service';
import { Cron } from '@nestjs/schedule';
import { ElasticsearchSensorService } from '../elasticsearch-sensor/elasticsearch-sensor.service';
import { ChangeStream } from 'mongodb';
import { InjectModel } from '@nestjs/mongoose';

interface MongoWatch {
  operationType: string;
  documentKey: {
    _id: ObjectId;
  };
}

@Injectable()
export class DeviceService {
  constructor(
    @InjectModel(Device.name)
    private readonly deviceModel: Model<DeviceDocument>,
    @InjectModel(Lamp.name)
    private readonly lampModel: Model<LampDocument>,
    @Inject(forwardRef(() => GroupService))
    private groupService: GroupService,
    @Inject(forwardRef(() => SensorService))
    private sensorService: SensorService,
    @Inject(forwardRef(() => LampService))
    private lampService: LampService,
    private chtiotClientService: ChtiotClientService,
    private googleClientService: GoogleClientService,
    private configService: ConfigService,
    @Inject(forwardRef(() => ElasticsearchSensorService))
    private readonly elasticsearchSensorService: ElasticsearchSensorService,
  ) {}

  private readonly logger = new Logger(DeviceService.name);

  async onModuleInit() {
    // update all devices status to the cityos' database
    const devices = await this.deviceModel.find().populate({ path: 'groups' });
    await Promise.all(
      devices.flatMap(async (device) => {
        if (device.groups.length > 0) {
          const { projectKey } = device.groups[0];
          const status = await this.chtiotClientService
            .getActiveStatus(projectKey, device.deviceId)
            .catch((_error: ApolloError) => {
              return DeviceStatus.ERROR;
            });
          await this.updateDeviceStatus(device.deviceId, status);
        }
      }),
    );
  }

  async getDeviceByObjectId(id: string): Promise<Device> {
    return this.deviceModel.findById({
      _id: new Types.ObjectId(id),
    });
    // .populate({ path: 'groups', model: Group })
    // .populate({ path: 'sensors', model: Sensor });
  }

  async getDeviceById(deviceId: string): Promise<Device> {
    return this.deviceModel.findOne({
      deviceId,
    });
  }

  async getDeviceByIds(deviceIds: string[]): Promise<Device[]> {
    return this.deviceModel.find({
      deviceId: { $in: deviceIds },
    });
  }

  async searchDevices(
    groupId: string,
    filter?: DeviceFilter,
    size?: number,
    after?: string,
    before?: string,
  ): Promise<DeviceConnection> {
    // Find all group ids under this groupId include itself
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );

    // Build up the query for filter
    let filterCondition = {};
    const sortField = filter?.sortField ? filter.sortField : SortField.NAME;
    const sortOrder = filter?.sortOrder
      ? filter.sortOrder
      : SortOrder.ASCENDING;

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
    }

    const edges = await this.mongoQueryForDevices(
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
        const more = await this.mongoQueryForDevices(
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
        const more = await this.mongoQueryForDevices(
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

  async mongoQueryForDevices(
    size: number,
    filterCondition: any,
    sortField: SortField,
    sortOrder: SortOrder,
    reversed: boolean,
    after?: string,
  ): Promise<DeviceEdge[]> {
    let mainCondition = {};

    let idAfter = {};
    let order: SortOrder;
    if (reversed) {
      idAfter = { $lt: after };
      switch (sortOrder) {
        case SortOrder.ASCENDING: {
          order = SortOrder.DESCENDING;
          break;
        }
        case SortOrder.DESCENDING: {
          order = SortOrder.ASCENDING;
          break;
        }
      }
    } else {
      idAfter = { $gt: after };
      order = sortOrder;
    }

    if (after) {
      let pageCondition = {};
      const lastDevice = await this.deviceModel.findOne({
        _id: after,
      });
      switch (sortField) {
        case SortField.ID:
          pageCondition = {
            $or: [
              {
                deviceId:
                  order === SortOrder.ASCENDING
                    ? { $gt: lastDevice.deviceId }
                    : { $lt: lastDevice.deviceId },
              },
              {
                deviceId: lastDevice.deviceId,
                _id: idAfter,
              },
            ],
          };
          break;
        case SortField.NAME:
          pageCondition = {
            $or: [
              {
                name:
                  order === SortOrder.ASCENDING
                    ? { $gt: lastDevice.name }
                    : { $lt: lastDevice.name },
              },
              {
                name: lastDevice.name,
                _id: idAfter,
              },
            ],
          };
          break;
        case SortField.TYPE:
          pageCondition = {
            $or: [
              {
                type:
                  order === SortOrder.ASCENDING
                    ? { $gt: lastDevice.type }
                    : { $lt: lastDevice.type },
              },
              {
                type: lastDevice.type,
                _id: idAfter,
              },
            ],
          };
          break;
        case SortField.STATUS:
          pageCondition = {
            $or: [
              {
                status:
                  order === SortOrder.ASCENDING
                    ? { $gt: lastDevice.status }
                    : { $lt: lastDevice.status },
              },
              {
                status: lastDevice.status,
                _id: idAfter,
              },
            ],
          };
          break;
      }

      mainCondition = {
        $and: [filterCondition, pageCondition],
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mainCondition = filterCondition;
    }

    let sortCondition = {};
    switch (sortField) {
      case SortField.ID:
        sortCondition = {
          deviceId: order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case SortField.NAME:
        sortCondition = {
          name: order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case SortField.TYPE:
        sortCondition = {
          type: order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case SortField.STATUS:
        sortCondition = {
          status: order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
    }

    const queryAfterLimit = await this.deviceModel
      .find(mainCondition, null, { strictQuery: false })
      .sort(sortCondition)
      .limit(size + 1);

    const edges = queryAfterLimit.flatMap((device) => {
      const edge = new DeviceEdge();
      edge.node = device.toApolloDevice();
      edge.cursor = device._id as string;
      return edge;
    });

    return edges;
  }

  async devicesFromIOT(
    projectKey: string,
    type?: DeviceType,
    name?: string,
    desc?: string,
  ): Promise<ApolloDevice[]> {
    const devices = await this.chtiotClientService.getDevices(
      projectKey,
      undefined,
      type,
      name,
      desc,
    );

    const apolloDevices = Promise.all(
      devices.flatMap(async (d) => {
        const apolloDevice = d.toApolloDevice();
        apolloDevice.groups =
          (await this.getDeviceById(apolloDevice.deviceId))?.groups?.flatMap(
            (it) => it.toApolloGroup(),
          ) || [];
        return apolloDevice;
      }),
    );

    return apolloDevices;
  }

  async editDevice(
    projectKey: string,
    deviceId: string,
    eitDeviceInput: EditDeviceInput,
  ): Promise<boolean> {
    const device = await this.getDeviceById(deviceId);
    if (device === null) {
      throw new ApolloError(
        `Cannot find the device - ${deviceId} in the database.`,
        ErrorCode.DEVICE_NOT_FOUND,
      );
    }
    this.logger.log(
      `Edit the deivce[${deviceId}], input = ${JSON.stringify(eitDeviceInput)}`,
    );

    // update the device info in the CityOS
    // device name cannot be blank and max length is 255
    if (!this.isValidEditDeviceInput(eitDeviceInput)) {
      throw new ApolloError(
        'Please check the length of your inputs or device name is not empty.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }
    if (eitDeviceInput.name) device.name = eitDeviceInput.name;
    if (eitDeviceInput.desc) device.desc = eitDeviceInput.desc;
    if (eitDeviceInput.location) {
      if (eitDeviceInput.location === null) {
        device.location = null;
      } else {
        const geoJson = new GeoJSON();
        geoJson.coordinates = [
          eitDeviceInput.location.lng,
          eitDeviceInput.location.lat,
        ];
        // throw error when invalid coordinates
        if (geoJson.isValidCoordinates()) {
          device.location = geoJson;
        } else {
          throw new ApolloError(
            'Please check the input of location is valid.',
            ErrorCode.INPUT_PARAMETERS_INVALID,
          );
        }
        // update timezone and address
        const timezoneChanged = await this.updateLocationInfo(
          device,
          device.location.coordinates[1],
          device.location.coordinates[0],
        );

        if (timezoneChanged) {
          if (
            (device as Lamp).lightSchedule?.manualSchedule?.enableManualSchedule
          ) {
            await this.lampService.updateScheduleOnIOT(device as Lamp);
          }
        }
      }
    }
    if (eitDeviceInput.attributes) {
      // user cannot edit the device_type in the attributes
      const originalType = device.attributes.find(
        (it) => it.key === Constants.KEY_ATTR_DEVICE_TYPE,
      ).value;

      const updatedType = eitDeviceInput.attributes.find(
        (it) => it.key === Constants.KEY_ATTR_DEVICE_TYPE,
      ).value;

      if (originalType !== updatedType) {
        throw new ApolloError(
          'You cannot change the device_type in the attributes.',
          ErrorCode.DEVICE_TYPE_INCORRECT,
        );
      }

      device.attributes = eitDeviceInput.attributes.flatMap((it) => {
        const attribute = new Attribute();
        attribute.key = it.key;
        attribute.value = it.value;
        return attribute;
      });
    }
    if (eitDeviceInput?.imageIds) {
      device.imageIds = eitDeviceInput?.imageIds || [];
    }

    // update device info in the CHT IOT platform
    const response = await this.chtiotClientService.editDevice(
      projectKey,
      device,
    );
    if (response.id !== device.deviceId) {
      throw new ApolloError(
        `Cannot find deviceId - ${device.deviceId} in the platform.`,
        ErrorCode.DEVICE_NOT_FOUND,
      );
    }

    return !!(await this.deviceModel.updateOne({ _id: device._id }, device));
  }

  async addDevices(
    projectKey: string,
    groupId: string,
    deviceIds: string[],
  ): Promise<boolean> {
    // check the deviceIds is not empty
    if (deviceIds.length === 0) {
      return false;
    }

    const devicesFromIOT = await this.chtiotClientService.getDevices(
      projectKey,
      deviceIds,
    );
    const group = await this.groupService.getGroup(groupId);
    if (group === null) {
      throw new ApolloError(
        `Cannot find group ${groupId} in the database.`,
        ErrorCode.GROUP_NOT_FOUND,
      );
    }
    this.logger.log(
      `add devices to ${group.name}, device ids = ${JSON.stringify(deviceIds)}`,
    );

    const start = Date.now();
    await Promise.all(
      devicesFromIOT.flatMap(async (iotDevice) => {
        let device = await this.getDeviceById(iotDevice.deviceId);
        const iotSensors = await this.chtiotClientService.getSensors(
          projectKey,
          iotDevice.deviceId,
        );
        if (device === null) {
          // discover the new device
          // add group
          device = iotDevice;
          device.groups = [group];

          // add sensors
          const sensors = await this.sensorService.create(iotSensors);
          device.sensors = sensors;

          if (device.location?.coordinates) {
            // add timezone and address
            await this.updateLocationInfo(
              device,
              device.location.coordinates[1],
              device.location.coordinates[0],
            );
          }

          // add active setting
          await this.chtiotClientService.editActiveSetting(
            projectKey,
            device.deviceId,
            ActiveSettingUtils.settingFromType(device.type),
          );

          // check this new device should subscribe sensor from IOT or not
          this.elasticsearchSensorService.subscribeNewDevice(
            projectKey,
            device,
          );

          // using the correct model to create so that mongoose creates the correct '__t' to identify the discriminators
          switch (device.type) {
            case DeviceType.LAMP:
              // add lightSchedule
              // eslint-disable-next-line no-case-declarations
              const lamp = device as Lamp;
              lamp.lightSchedule = {
                lightSensor: {
                  enableLightSensor: false,
                  lightSensorCondition: [],
                },
                manualSchedule: {
                  enableManualSchedule: false,
                  schedules: [],
                },
              };
              await this.lampModel.create(lamp);
              break;
            default:
              await this.deviceModel.create(device);
              break;
          }
        } else {
          // exist in the cityos before
          // add group reference to this device if not exist before
          if (
            !device.groups
              .flatMap((it) => it._id.toHexString())
              .includes(group._id.toHexString())
          ) {
            device.groups.push(group);
          }
          // only create the sensors not in the cityos before
          const newSensors = iotSensors.filter(
            (sensor) =>
              !device.sensors
                .flatMap((it) => it.sensorId)
                .includes(sensor.sensorId),
          );
          const sensors = await this.sensorService.create(newSensors);
          device.sensors = [...device.sensors, ...sensors];

          // update the deviceType from the IOT
          device.type = iotDevice.type;
          const attributes = iotDevice.attributes.filter(
            (it) => it.key === Constants.KEY_ATTR_DEVICE_TYPE,
          );
          if (attributes.length > 0) {
            const typeAttribute = attributes[0];
            const attributesInCityOS = device.attributes.filter(
              (it) => it.key !== Constants.KEY_ATTR_DEVICE_TYPE,
            );
            attributesInCityOS.push(typeAttribute);
            device.attributes = attributesInCityOS;
          }

          await this.deviceModel.findByIdAndUpdate(device._id, device);
        }
      }),
    );

    const end = Date.now();
    this.logger.debug(`Spend (addDevices): ${end - start} ms.`);

    return true;
  }

  async deleteDevices(
    projectKey: string,
    groupId: string,
    deviceIds: string[],
  ): Promise<string[]> {
    const deletable: string[] = [];
    this.logger.log(
      `delete devices ${JSON.stringify(deviceIds)} from ${groupId}.`,
    );
    await Promise.all(
      deviceIds.flatMap(async (deviceId) => {
        const device = await this.getDeviceById(deviceId);
        if (device === null) {
          this.logger.warn(
            `Cannot delete the device ${deviceId} due to not existed in the database.`,
          );
          return;
        }

        const groupsForDevice = device.groups.flatMap((it) =>
          it._id.toHexString(),
        );
        this.logger.debug(
          `device[${deviceId}]'s groups = ${JSON.stringify(groupsForDevice)}`,
        );

        // If this device belongs to this group, remove it from the group
        const index = groupsForDevice.indexOf(groupId);
        if (index > -1) {
          const disabledGroup = device.groups[index];
          device.groups.splice(index, 1);
          this.logger.debug(
            `Remove ${groupId} from device[${deviceId}] => groups = ${JSON.stringify(
              device.groups,
            )}`,
          );

          await this.deviceModel.findByIdAndUpdate(device._id, {
            $set: {
              groups: device.groups,
              disabledGroups: [
                ...device.disabledGroups,
                {
                  ids: disabledGroup,
                  disabledAt: new Date(),
                },
              ],
            },
          });

          deletable.push(deviceId);
        }
      }),
    );

    return deletable;
  }

  async restoreDevices(
    projectKey: string,
    groupId: string,
    deviceIds: string[],
  ): Promise<string[]> {
    const restoreTable: string[] = [];
    this.logger.log(
      `restore devices ${JSON.stringify(deviceIds)} from ${groupId}.`,
    );
    await Promise.all(
      deviceIds.flatMap(async (deviceId) => {
        const device = await this.getDeviceById(deviceId);
        if (device === null) {
          throw new ApolloError(
            `Cannot find the device - ${deviceId} in the database.`,
            ErrorCode.DEVICE_NOT_FOUND,
          );
        }

        const disabledGroupsForDevice = device.disabledGroups.flatMap((it) =>
          it.ids._id.toHexString(),
        );
        this.logger.debug(
          `device[${deviceId}]'s groups = ${JSON.stringify(
            disabledGroupsForDevice,
          )}`,
        );

        const index = disabledGroupsForDevice.indexOf(groupId);
        if (index > -1) {
          const restoredGroup = device.disabledGroups[index];
          device.disabledGroups.splice(index, 1);
          this.logger.debug(
            `Restore ${groupId} from device[${deviceId}] => groups = ${JSON.stringify(
              device.groups,
            )}`,
          );

          await this.deviceModel.findByIdAndUpdate(device._id, {
            $set: {
              groups: [...device.groups, restoredGroup.ids],
              disabledGroups: device.disabledGroups,
            },
          });

          restoreTable.push(deviceId);
        }
      }),
    );

    return restoreTable;
  }

  async searchDevicesOnMap(
    groupId: string,
    filter: MapDeviceFilter,
  ): Promise<MapDevices> {
    const devices = await this.devicesOnMap(groupId, filter);

    const mapDevices = new MapDevices();
    mapDevices.devices = devices.map((it) => it.toApolloDevice());
    return mapDevices;
  }

  async searchClustersOnMap(
    groupId: string,
    filter: MapDeviceFilter,
    level: number,
  ): Promise<MapClusters> {
    const devices = await this.devicesOnMap(groupId, filter);

    const points: Array<Supercluster.PointFeature<GeoJsonProperties>> =
      devices.map((d) => ({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: d.location?.coordinates,
        },
      }));

    const index = new Supercluster({
      maxZoom: 22,
      radius: 180,
    });
    index.load(points);
    const clusters = index.getClusters([-180, -85, 180, 85], level);

    const mapClusters = new MapClusters();
    mapClusters.cluster = clusters.map((cluster) => {
      const deviceCluster = new DevicesCluster();
      const gpsPoint = new GPSPoint();
      [gpsPoint.lng, gpsPoint.lat] = [
        cluster.geometry.coordinates[0],
        cluster.geometry.coordinates[1],
      ];
      deviceCluster.location = gpsPoint;
      deviceCluster.count = (cluster.properties.point_count as number) || 1;
      return deviceCluster;
    });

    // Tell user the possible rectangle on the map if they do not provide the gpsRectInput
    if (!filter?.gpsRectInput && devices.length > 0) {
      const boundary = this.getBoundary(devices);
      const sw = boundary[0];
      const ne = boundary[1];
      const gpsRect = new GPSRect();
      gpsRect.sw = sw;
      gpsRect.ne = ne;
      mapClusters.gpsRect = gpsRect;
      this.logger.debug(
        `Display the map on sw(${sw?.lat}, ${sw?.lng}), ne(${ne?.lat}, ${ne?.lng})`,
      );
    }

    return mapClusters;
  }

  async updateDeviceStatus(deviceId: string, status: DeviceStatus) {
    // step1. update the 'status field'
    const device = await this.deviceModel.findOneAndUpdate(
      { deviceId },
      {
        status,
      },
      {
        useFindAndModify: false,
        new: true,
      },
    );

    // step2. update the 'relatedStatus` field
    const parentDevice = device?.attributes.find((it) => {
      return it.key === Constants.KEY_ATTR_ATTACH_ON;
    });

    // if it has the parent device
    if (parentDevice) {
      const related = await this.getRelatedDevices(parentDevice.value);
      const relatedAllActive = related.every(
        (it) => it.status === DeviceStatus.ACTIVE,
      );

      await this.deviceModel.findOneAndUpdate(
        {
          uri: parentDevice.value,
        },
        {
          relatedStatus: relatedAllActive
            ? DeviceStatus.ACTIVE
            : DeviceStatus.ERROR,
        },
        {
          useFindAndModify: false,
        },
      );
    }

    const childDevices = await this.getRelatedDevices(device?.uri);
    // if without child devices
    if (childDevices.length === 0) {
      await this.deviceModel.findOneAndUpdate(
        { deviceId },
        {
          status,
          relatedStatus: DeviceStatus.ACTIVE,
        },
        {
          useFindAndModify: false,
        },
      );
    } else {
      // if has child devices
      const relatedAllActive = childDevices.every(
        (it) => it.status === DeviceStatus.ACTIVE,
      );

      await this.deviceModel.findOneAndUpdate(
        { deviceId },
        {
          relatedStatus: relatedAllActive
            ? DeviceStatus.ACTIVE
            : DeviceStatus.ERROR,
        },
        {
          useFindAndModify: false,
        },
      );
    }
  }

  //updateDeviceMaintainStatus
  async updateDeviceMaintainStatus(
    groupId: string,
    deviceId: string,
    maintainstatus: string,
  ): Promise<boolean> {
    const device = await this.getDeviceById(deviceId);
    if (deviceId.length == 0) {
      // this device still belongs to other groups
      return false;
    } else {
      // this device's groups is empty
      await this.deviceModel.findByIdAndUpdate(device._id, {
        $set: {
          maintainstatus: maintainstatus,
        },
      });
    }
    // if has any attached device
    return true;
  }

  async getRelatedDevices(lampUri: string): Promise<Device[]> {
    return this.deviceModel.find({
      attributes: {
        $elemMatch: { key: Constants.KEY_ATTR_ATTACH_ON, value: lampUri },
      },
    });
  }

  private getBoundary(devices: Device[]): [GPSPoint, GPSPoint] {
    let sw: GPSPoint;
    let ne: GPSPoint;

    const filteredDevices = devices.filter(
      (it) => it.location !== undefined && it.location !== null,
    );
    if (filteredDevices[0]) {
      sw = new GPSPoint();
      ne = new GPSPoint();
      [sw.lng, sw.lat, ne.lng, ne.lat] = [
        filteredDevices[0].location.coordinates[0],
        filteredDevices[0].location.coordinates[1],
        filteredDevices[0].location.coordinates[0],
        filteredDevices[0].location.coordinates[1],
      ];
    }

    filteredDevices.forEach((device) => {
      const lng = device.location.coordinates[0];
      const lat = device.location.coordinates[1];
      if (lng > ne.lng) {
        ne.lng = lng;
      } else if (lng < sw.lng) {
        sw.lng = lng;
      }

      if (lat > ne.lat) {
        ne.lat = lat;
      } else if (lat < sw.lat) {
        sw.lat = lat;
      }
    });

    return [sw, ne];
  }

  async getSensorsUnderGroup(
    groupId: string,
    deviceType?: DeviceType,
    deviceIds?: string[],
  ): Promise<Sensor[]> {
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );
    const uniqueSensors: Sensor[] = [];

    const devices = await this.deviceModel
      .where('groups')
      .in(ids)
      .find(deviceType ? { type: deviceType } : {});

    devices.forEach((device) => {
      if (deviceIds) {
        if (!deviceIds.includes(device.deviceId)) return;
      }

      device.sensors.forEach((sensor) => {
        sensor.deviceType = device.type;
        const existed = uniqueSensors.some(
          (it) =>
            it.deviceType === sensor.deviceType &&
            it.sensorId === sensor.sensorId,
        );
        if (!existed) {
          uniqueSensors.push(sensor);
        }
      });
    });
    return uniqueSensors;
  }

  async getDevicesUnderGroup(
    groupId: string,
    deviceType?: DeviceType,
    sensorId?: string,
  ): Promise<Device[]> {
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );

    const devices = await this.deviceModel
      .where('groups')
      .in(ids)
      .find(deviceType ? { type: deviceType } : {});

    if (sensorId) {
      return devices.filter((device) => {
        return device.sensors.some((sensor) => {
          return sensor.sensorId === sensorId;
        });
      });
    } else {
      return devices;
    }
  }

  async getDeviceCount(groupId: string): Promise<number> {
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );

    const devices = this.deviceModel.where('groups').in(ids);
    return devices.countDocuments();
  }

  async removeDeviceFrom(
    projectKey: string,
    groupId: string,
  ): Promise<boolean> {
    const devices = await this.deviceModel
      .where('groups')
      .in([new Types.ObjectId(groupId)]);
    const deviceIds = devices.flatMap((it) => it.deviceId);
    return !!(await this.deleteDevices(projectKey, groupId, deviceIds));
  }

  async getProjectKeyById(deviceId: string): Promise<string> {
    return (await this.getDeviceById(deviceId))?.groups[0].projectKey;
  }

  getBrandByDevice(device: Device): string | undefined {
    const brandAttribute = device.attributes.find(
      (attribute) => attribute.key === 'brand',
    );
    return brandAttribute ? brandAttribute.value : undefined;
  }

  async isDevicesUnderGroup(
    groupId: string,
    devices: Device[],
  ): Promise<boolean> {
    const results = await Promise.all(
      devices.flatMap(async (device) => {
        return (
          await Promise.all(
            device.groups.map(async (g) => {
              const groups = await this.groupService.getAllChilds(
                new Types.ObjectId(groupId),
                true,
              );
              return groups.flatMap((it) => it.toHexString()).includes(g.id);
            }),
          )
        ).some((val) => val);
      }),
    );
    return !results.includes(false);
  }

  async isDevicesUnder(user: User, devices: Device[]): Promise<boolean> {
    const results = await Promise.all(
      devices.flatMap(async (it) => this.isDeviceUnder(user, it)),
    );

    // if one of devices is not accessible, return false
    return !results.includes(false);
  }

  async isDeviceUnder(user: User, device: Device): Promise<boolean> {
    if (device == null) {
      return false;
    }

    // if one of the device's group under the current user's group, return true
    return (
      await Promise.all(
        device.groups.map(async (g) => {
          return this.groupService.isGroupUnder(user, g._id.toHexString());
        }),
      )
    ).some((val) => val);
  }

  private isValidEditDeviceInput(editDeviceInput: EditDeviceInput): boolean {
    if (editDeviceInput.name !== undefined) {
      if (
        editDeviceInput.name.trim() === '' ||
        editDeviceInput.name === null ||
        editDeviceInput.name.length > 255
      ) {
        return false;
      }
    }

    if (editDeviceInput.desc) {
      if (editDeviceInput.desc.length > 2000) {
        return false;
      }
    }

    if (editDeviceInput.attributes) {
      const invalid = editDeviceInput.attributes.some((attribute) => {
        if (attribute.key.length > 200 || attribute.value.length > 200) {
          return true;
        }
        return false;
      });
      if (invalid) {
        return false;
      }
    }

    return true;
  }

  /* eslint no-param-reassign: ["error", { "props": false }] */
  private async updateLocationInfo(
    device: Device,
    lat: number,
    lon: number,
  ): Promise<boolean> {
    const oldRawOffset = device.timezone?.rawOffset;

    // add timezone
    const timezone = await this.googleClientService.getTimeZone(lat, lon);
    if (timezone !== null) device.timezone = timezone;

    // add address
    await Promise.all(
      this.getAddressLanguages().flatMap(async (language) => {
        const address = await this.googleClientService.addressLookup(
          language,
          lat,
          lon,
        );
        if (address !== null) device.address.push(address);
        return true;
      }),
    );

    // return the timeZone changed or not
    return oldRawOffset !== device.timezone?.rawOffset;
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

  // 每天凌晨清除 30 天前停用的設備
  @Cron('0 0 * * * *')
  async handleCron() {
    const timing = new Date(new Date().setDate(new Date().getDate() - 30));

    const deviceList = await this.deviceModel.find({
      disabledGroups: {
        $elemMatch: {
          disabledAt: {
            $lte: timing,
          },
        },
      },
    });

    deviceList.map(async (device) => {
      const removeList: DisabledGroup[] = [];
      device.disabledGroups.map((group) => {
        if (group.disabledAt < timing) {
          removeList.push(group);
        }
      });

      const tmpDisabledGroups = device.disabledGroups;

      for (const disabledGroup of device.disabledGroups) {
        if (disabledGroup.disabledAt < timing) {
          tmpDisabledGroups.splice(tmpDisabledGroups.indexOf(disabledGroup), 1);
          this.logger.log(
            `Automatic virtual delete device: ${JSON.stringify(
              disabledGroup.ids,
            )}`,
          );
        }
      }

      if (tmpDisabledGroups.length === 0 && device.groups.length === 0) {
        this.logger.log(
          `Automatic actual delete device: ${JSON.stringify(device._id)}`,
        );

        // real delete the device and sensors
        await this.deviceModel.findByIdAndDelete(device._id);
        await this.sensorService.delete(device.sensors);
      } else {
        await this.deviceModel.findByIdAndUpdate(device._id, {
          $set: {
            disabledGroups: tmpDisabledGroups,
          },
        });
      }
    });
  }

  async devicesOnMap(
    groupId: string,
    filter: MapDeviceFilter,
  ): Promise<Device[]> {
    // Find all group ids under this groupId include itself
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );

    let filterCondition = {};

    if (filter) {
      const { type } = filter;
      const { enableSchedule } = filter;
      const { gpsRectInput } = filter;
      const { keyword } = filter;
      const { isDevicesUnderLampActive } = filter;
      const regKeyword = new RegExp(StringUtils.escapeRegExp(keyword), 'i');

      // Check legitimate input for gpsRect
      if (gpsRectInput) {
        if (
          gpsRectInput.ne.lat === gpsRectInput.sw.lat &&
          gpsRectInput.ne.lng === gpsRectInput.sw.lng
        ) {
          throw new ApolloError(
            'Cannot search devices if your gpsRect.ne and gpsRect.sw are in the same location.',
            ErrorCode.INPUT_PARAMETERS_INVALID,
          );
        }
      }

      filterCondition = {
        $and: [
          { groups: { $in: ids } },
          type ? { type } : {},
          {
            location: { $ne: null },
          },
          enableSchedule !== undefined
            ? {
                'lightSchedule.manualSchedule.enableManualSchedule':
                  enableSchedule,
              }
            : {},
          filter?.gpsRectInput
            ? {
                location: {
                  $geoWithin: {
                    $geometry: {
                      type: 'Polygon',
                      coordinates: [
                        [
                          [gpsRectInput.sw.lng, gpsRectInput.sw.lat],
                          [gpsRectInput.sw.lng, gpsRectInput.ne.lat],
                          [gpsRectInput.ne.lng, gpsRectInput.ne.lat],
                          [gpsRectInput.ne.lng, gpsRectInput.sw.lat],
                          [gpsRectInput.sw.lng, gpsRectInput.sw.lat],
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
    }

    return this.deviceModel
      .find(filterCondition, null, { strictQuery: false })
      .exec();
  }

  deviceOnMongoChanged(
    onDeviceAdded: (device?: Device) => void,
  ): ChangeStream<Document> {
    const pipeline = [
      {
        $match: {
          $or: [
            { operationType: 'insert' },
            { operationType: 'delete' },
            {
              $and: [
                { operationType: 'update' },
                { 'updateDescription.updatedFields.groups': { $exists: true } },
              ],
            },
          ],
        },
      },
    ];

    const stream = this.deviceModel.watch<Document>(pipeline);
    stream
      .on('change', (next: MongoWatch) => {
        void (async () => {
          const device = await this.deviceModel.findById(next.documentKey);

          if (device) {
            onDeviceAdded(device);
          }

          if (next.operationType === 'delete') {
            onDeviceAdded(null);
          }
        })();
      })
      .on('error', (e) => {
        this.logger.error(e);
      });

    return stream;
  }

  async searchAbnormalDevices(
    groupId: string,
    filter?: DeviceFilter,
    size?: number,
    skip?: number,
  ): Promise<DeviceConnection> {
    // Build up the query for filter

    let filterCondition = {};
    const sortField = filter?.sortField ? filter.sortField : SortField.NAME;
    const sortOrder = filter?.sortOrder
      ? filter.sortOrder
      : SortOrder.ASCENDING;

    if (filter) {
      const { type } = filter;
      const { status } = filter;
      const { maintainstatus } = filter;
      const { enableSchedule } = filter;
      const { keyword } = filter;
      const { isDevicesUnderLampActive } = filter;
      const regKeyword = new RegExp(StringUtils.escapeRegExp(keyword), 'i');
      const gpsRect = filter.gpsRectInput;

      // Check legitimate input for gpsRect
      if (gpsRect) {
        if (
          gpsRect.ne.lat === gpsRect.sw.lat &&
          gpsRect.ne.lng === gpsRect.sw.lng
        ) {
          throw new ApolloError(
            'Cannot search devices if your gpsRect.ne and gpsRect.sw are in the same location.',
            ErrorCode.INPUT_PARAMETERS_INVALID,
          );
        }
      }

      filterCondition = {
        $and: [
          type ? { type } : {},
          status ? { status } : {},
          maintainstatus ? { maintainstatus } : {},
          // { status: { $in: 'ERROR' } },
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
    }

    // Find all group ids under this groupId include itself
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );

    // Find all devices owned by these groups
    const mainCondition = filterCondition;

    let sortCondition = {};
    switch (sortField) {
      case SortField.ID:
        sortCondition = {
          deviceId: sortOrder === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case SortField.NAME:
        sortCondition = {
          name: sortOrder === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case SortField.TYPE:
        sortCondition = {
          type: sortOrder === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case SortField.STATUS:
        sortCondition = {
          status: sortOrder === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case SortField.MAINTAINSTATUS:
        sortCondition = {
          maintainstatus: sortOrder === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      default: {
        this.logger.error(
          `Cannot find the sortField ${filter?.sortField} in searchDevices.`,
        );
        break;
      }
    }

    const lengthForDevices = (
      await this.deviceModel
        .where('groups')
        .in(ids)
        .find(mainCondition)
        .sort(sortCondition)
    ).length;

    const queryAfterLimit: Device[] = await this.deviceModel
      .where('groups')
      .in(ids)
      .find(mainCondition)
      .sort(sortCondition)
      .skip(skip * size)
      .limit(size)
      .populate({ path: 'groups' })
      .populate({ path: 'sensors' });

    // Save the devices into the connection
    const deviceConnection = new DeviceConnection();
    const pageInfo = new PageInfo();
    if (queryAfterLimit.length > 0) {
      pageInfo.endCursor =
        queryAfterLimit[queryAfterLimit.length - 1]._id.toHexString();
    }
    pageInfo.hasNextPage = lengthForDevices > queryAfterLimit.length;

    const edges = queryAfterLimit.flatMap((device) => {
      const edge = new DeviceEdge();
      edge.node = device.toApolloDevice();
      edge.cursor = device._id.toHexString();
      return edge;
    });

    deviceConnection.pageInfo = pageInfo;
    deviceConnection.edges = edges;
    deviceConnection.totalCount = await this.deviceModel
      .where('groups')
      .in(ids)
      .find(filterCondition)
      .countDocuments();

    // Tell user the possible rectangle on the map if they do not provide the gpsRectInput
    if (!filter?.gpsRectInput && queryAfterLimit.length > 0) {
      const boundary = this.getBoundary(queryAfterLimit);
      const sw = boundary[0];
      const ne = boundary[1];
      const gpsRect = new GPSRect();
      gpsRect.sw = sw;
      gpsRect.ne = ne;
      deviceConnection.gpsRect = gpsRect;
      this.logger.debug(
        `Display the map on sw(${sw?.lat}, ${sw?.lng}), ne(${ne?.lat}, ${ne?.lng})`,
      );
    }

    return deviceConnection;
  }

  async searchDevicesbystaff(
    deviceIds: string[],
    groupId: string,
    filter?: DeviceFilter,
    size?: number,
    after?: string,
  ): Promise<DeviceConnection> {
    // Build up the query for filter

    let filterCondition = {};
    const sortField = filter?.sortField ? filter.sortField : SortField.NAME;
    const sortOrder = filter?.sortOrder
      ? filter.sortOrder
      : SortOrder.ASCENDING;

    if (filter) {
      const { type } = filter;
      const { enableSchedule } = filter;
      const { keyword } = filter;
      const { isDevicesUnderLampActive } = filter;
      const regKeyword = new RegExp(StringUtils.escapeRegExp(keyword), 'i');
      const gpsRect = filter.gpsRectInput;

      // Check legitimate input for gpsRect
      if (gpsRect) {
        if (
          gpsRect.ne.lat === gpsRect.sw.lat &&
          gpsRect.ne.lng === gpsRect.sw.lng
        ) {
          throw new ApolloError(
            'Cannot search devices if your gpsRect.ne and gpsRect.sw are in the same location.',
            ErrorCode.INPUT_PARAMETERS_INVALID,
          );
        }
      }

      filterCondition = {
        $and: [
          type ? { type } : {},
          { deviceId: { $in: deviceIds } },
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
    }

    // Find all group ids under this groupId include itself
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );

    // Find all devices owned by these groups
    let mainCondition = filterCondition;
    let pageCondition = {};
    if (after) {
      const lastDevice = await this.deviceModel.findOne({
        _id: after,
      });
      switch (sortField) {
        case SortField.ID:
          pageCondition = {
            $or: [
              {
                deviceId:
                  sortOrder === SortOrder.ASCENDING
                    ? { $gt: lastDevice.deviceId }
                    : { $lt: lastDevice.deviceId },
              },
              {
                deviceId: lastDevice.deviceId,
                _id: { $gt: after },
              },
            ],
          };
          break;
        case SortField.NAME:
          pageCondition = {
            $or: [
              {
                name:
                  sortOrder === SortOrder.ASCENDING
                    ? { $gt: lastDevice.name }
                    : { $lt: lastDevice.name },
              },
              {
                name: lastDevice.name,
                _id: { $gt: after },
              },
            ],
          };
          break;
        case SortField.TYPE:
          pageCondition = {
            $or: [
              {
                type:
                  sortOrder === SortOrder.ASCENDING
                    ? { $gt: lastDevice.type }
                    : { $lt: lastDevice.type },
              },
              {
                type: lastDevice.type,
                _id: { $gt: after },
              },
            ],
          };
          break;
        case SortField.STATUS:
          pageCondition = {
            $or: [
              {
                status:
                  sortOrder === SortOrder.ASCENDING
                    ? { $gt: lastDevice.status }
                    : { $lt: lastDevice.status },
              },
              {
                status: lastDevice.status,
                _id: { $gt: after },
              },
            ],
          };
          break;
        default: {
          this.logger.error(
            `Cannot find the sortField ${filter?.sortField} in searchDevices.`,
          );
          break;
        }
      }

      mainCondition = {
        $and: [filterCondition, pageCondition],
      };
    }

    let sortCondition = {};
    switch (sortField) {
      case SortField.ID:
        sortCondition = {
          deviceId: sortOrder === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case SortField.NAME:
        sortCondition = {
          name: sortOrder === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case SortField.TYPE:
        sortCondition = {
          type: sortOrder === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case SortField.STATUS:
        sortCondition = {
          status: sortOrder === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      default: {
        this.logger.error(
          `Cannot find the sortField ${filter?.sortField} in searchDevices.`,
        );
        break;
      }
    }

    const lengthForDevices = (
      await this.deviceModel
        .where('groups')
        .in(ids)
        .find(mainCondition)
        .sort(sortCondition)
    ).length;

    const queryAfterLimit: Device[] = await this.deviceModel
      .where('groups')
      .in(ids)
      .find(mainCondition)
      .sort(sortCondition)
      .limit(size)
      .populate({ path: 'groups' })
      .populate({ path: 'sensors' });

    // Save the devices into the connection
    const deviceConnection = new DeviceConnection();
    const pageInfo = new PageInfo();
    if (queryAfterLimit.length > 0) {
      pageInfo.endCursor =
        queryAfterLimit[queryAfterLimit.length - 1]._id.toHexString();
    }
    pageInfo.hasNextPage = lengthForDevices > queryAfterLimit.length;

    const edges = queryAfterLimit.flatMap((device) => {
      const edge = new DeviceEdge();
      edge.node = device.toApolloDevice();
      edge.cursor = device._id.toHexString();
      return edge;
    });

    deviceConnection.pageInfo = pageInfo;
    deviceConnection.edges = edges;
    deviceConnection.totalCount = await this.deviceModel
      .where('groups')
      .in(ids)
      .find(filterCondition)
      .countDocuments();

    // Tell user the possible rectangle on the map if they do not provide the gpsRectInput
    if (!filter?.gpsRectInput && queryAfterLimit.length > 0) {
      const boundary = this.getBoundary(queryAfterLimit);
      const sw = boundary[0];
      const ne = boundary[1];
      const gpsRect = new GPSRect();
      gpsRect.sw = sw;
      gpsRect.ne = ne;
      deviceConnection.gpsRect = gpsRect;
      this.logger.debug(
        `Display the map on sw(${sw?.lat}, ${sw?.lng}), ne(${ne?.lat}, ${ne?.lng})`,
      );
    }

    return deviceConnection;
  }

  // async getDeviceUnderFloor(deviceId: string[], groupId): Promise<Device[]> {
  //   const ids = await this.groupService.getAllChilds(
  //     new Types.ObjectId(groupId),
  //     true,
  //   )
  //   let filterCondition = {};
  //   filterCondition = {
  //     $and: [
  //       { groups: { $in: ids }, deviceId: { $in: deviceId }, },
  //     ]
  //   }
  //   return this.deviceModel
  //     .find(
  //       filterCondition)
  //     .populate({ path: 'groups', model: Group })
  //     .populate({ path: 'sensors', model: Sensor });
  // }

  // async getDeviceUnderFloor1(deviceId: string): Promise<Device> {
  //   return this.deviceModel
  //     .findOne({
  //       _id: deviceId,
  //     })
  //     .populate({ path: 'groups', model: Group })
  //     .populate({ path: 'sensors', model: Sensor });
  // }
}
