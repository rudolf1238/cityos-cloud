import {
  Args,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
  Subscription,
} from '@nestjs/graphql';
import {
  Action,
  DeviceStatusResponse,
  DeviceType,
  EditSensorInput,
  ExtremeOperation,
  GadgetForGenderAndAgeInput,
  GaugeSensorData,
  GenderAndAgeData,
  ISensorData,
  MultiISensorData,
  MetricAggregationResponse,
  ProperRateResponse,
  RecognitionType,
  SensorResponse,
  SensorType,
  SensorValueStatsHistoryInput,
  SnapshotSensorData,
  StatsOption,
  Subject,
  SwitchSensorData,
  TextSensorData,
} from 'src/graphql.schema';
import { forwardRef, Inject, UseGuards } from '@nestjs/common';
import { ApolloError, ForbiddenError } from 'apollo-server-express';
import { User } from 'src/models/user';
import { Constants } from 'src/constants';
import { Log, UserEvent } from 'src/models/log';
import { CurrentUser } from '../auth/auth.decorator';
import { DeviceService } from '../device/device.service';
import { SensorService } from './sensor.service';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { AppAbility } from '../permission/ability.factory';
import { LogService } from '../log/log.service';
import { ErrorCode } from 'src/models/error.code';
import { GroupService } from '../group/group.service';
import { ElasticSearchSensor } from 'src/models/elasticsearch.sensor';

@Resolver('Sensor')
export class SensorResolver {
  constructor(
    private readonly sensorService: SensorService,
    @Inject(forwardRef(() => DeviceService))
    private readonly deviceService: DeviceService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    private readonly logService: LogService,
  ) {}

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.MODIFY, Subject.LIGHTMAP),
  )
  @Mutation(() => Boolean)
  async updateSensor(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('sensorId') sensorId: string,
    @Args('value') value: any,
  ): Promise<boolean> {
    // permission check: 'deviceId' must under user's current division
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to update sensor for ${deviceId}.`,
      );
    }
    const projectKey = await this.deviceService.getProjectKeyById(deviceId);
    if (projectKey === null) return false;

    // log
    const log = new Log(
      user,
      UserEvent.UPDATE_SENSOR,
      '',
      [deviceId, sensorId],
      JSON.stringify(value),
    );
    await this.logService.insertEvent(log);

    return this.sensorService.updateSensor(
      projectKey,
      deviceId,
      sensorId,
      value,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.MODIFY, Subject.DEVICE),
  )
  @Mutation(() => Boolean)
  async editSensor(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('sensorId') sensorId: string,
    @Args('editSensorInput') editSensorInput: EditSensorInput,
  ): Promise<boolean> {
    // permission check: 'deviceId' must under user's current division
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to edit sensor for ${deviceId}.`,
      );
    }
    const projectKey = await this.deviceService.getProjectKeyById(deviceId);
    if (projectKey === null) return false;

    // log
    const log = new Log(
      user,
      UserEvent.MODIFY_SENSOR,
      '',
      [deviceId, sensorId],
      JSON.stringify(editSensorInput),
    );
    await this.logService.insertEvent(log);

    return this.sensorService.editSensor(
      projectKey,
      deviceId,
      sensorId,
      editSensorInput,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.LIGHTMAP),
  )
  @Subscription(() => SensorResponse)
  async sensorValueChanged(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('sensorId') sensorId: string,
  ) {
    // permission check: 'deviceId' must under user's current division
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to get sensor for ${deviceId}.`,
      );
    }

    return this.sensorService.listenSensorValueChanged(deviceId, sensorId);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.VIEW, Subject.LIGHTMAP),
  )
  @Subscription(() => DeviceStatusResponse)
  async devicesStatusChanged(
    @CurrentUser() user: User,
    @Args('deviceIds') deviceIds: string[],
  ) {
    // permission check: 'deviceIds' must under user's current division
    const devices = await this.deviceService.getDeviceByIds(deviceIds);
    if (!(await this.deviceService.isDevicesUnder(user, devices))) {
      throw new ForbiddenError(
        `You have no permission to get status for these devices.`,
      );
    }

    const redisTopic = `${
      Constants.PREFIX_FOR_DEVICE_STATUS_TOPIC
    }${user._id.toHexString()}`;
    return this.sensorService.listenDevicesStatusChanged(redisTopic, deviceIds);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DASHBOARD) &&
      ability.can(Action.VIEW, Subject.DEVICE),
  )
  @Query()
  async sensorValuesHistory(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('sensorId') sensorId: string,
    @Args('start') start: Date,
    @Args('end') end: Date,
    @Args('interval') interval: number,
  ): Promise<ISensorData[]> {
    // permission check: 'deviceId' must under user's current division
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to get sensor history for ${deviceId}.`,
      );
    }

    if (
      device.sensors.find((sensor) => sensor.sensorId === sensorId)?.type !==
      SensorType.GAUGE
    ) {
      throw new ApolloError(
        'Please check the existence of the sensor and the sensor type is GAUGE.',
        ErrorCode.SENSOR_TYPE_UNSUPPORTED,
      );
    }

    return this.sensorService.sensorValuesHistory(
      device,
      sensorId,
      start,
      end,
      interval,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.DASHBOARD),
  )
  @Query()
  async properRateHistory(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('start') start: Date,
    @Args('end') end: Date,
  ): Promise<ProperRateResponse[]> {
    // permission check: groupId is user's current group or sub-group
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(
        `You have no permission to view the group ${groupId}.`,
      );
    }

    return this.sensorService.properRateHistory(groupId, start, end);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DASHBOARD) &&
      ability.can(Action.VIEW, Subject.DEVICE),
  )
  @Subscription(() => SensorResponse)
  async extremeValueChanged(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceType') deviceType: DeviceType,
    @Args('sensorId') sensorId: string,
    @Args('option') option: StatsOption,
  ) {
    // permission check: groupId is user's current group or sub-group
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(
        `You have no permission to view the group ${groupId}.`,
      );
    }

    const redisTopic = `${
      Constants.PREFIX_FOR_EXTREME_VALUE_TOPIC
    }${groupId}/${deviceType}/${sensorId}/${option.operation}/${
      option.text
    }/${user._id.toHexString()}`;

    return this.sensorService.extremeValueChanged(
      redisTopic,
      groupId,
      deviceType,
      sensorId,
      option,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.DASHBOARD),
  )
  @Subscription(() => ProperRateResponse)
  async properRateChanged(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
  ) {
    // permission check: groupId is user's current group or sub-group
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(
        `You have no permission to view the group ${groupId}.`,
      );
    }

    const redisTopic = `${
      Constants.PREFIX_FOR_PROPER_RATE_TOPIC
    }${groupId}/${user._id.toHexString()}`;

    return this.sensorService.properRateChanged(redisTopic, groupId);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DASHBOARD) &&
      ability.can(Action.VIEW, Subject.DEVICE),
  )
  @Query()
  async sensorValueStatsHistory(
    @CurrentUser() user: User,
    @Args('input') input: SensorValueStatsHistoryInput,
  ): Promise<ISensorData[]> {
    // permission check: groupId is user's current group or sub-group
    if (!(await this.groupService.isGroupUnder(user, input.groupId))) {
      throw new ForbiddenError(
        `You have no permission to view the group ${input.groupId}.`,
      );
    }

    const devices = await this.deviceService.getDevicesUnderGroup(
      input.groupId,
      input.deviceType,
      input.sensorId,
    );

    if (devices.length === 0) {
      throw new ApolloError(
        `Cannot find any devices for ${input.deviceType} in the given group.`,
        ErrorCode.DEVICE_NOT_FOUND,
      );
    }

    let type: SensorType = null;
    devices.forEach((d) => {
      type = d.sensors.find(
        (sensor) => sensor.sensorId === input.sensorId,
      )?.type;
      if (type !== SensorType.GAUGE) {
        if (
          type === SensorType.TEXT &&
          input.option.operation === ExtremeOperation.COUNT &&
          input.option.text
        ) {
        } else {
          throw new ApolloError(
            'Please check the existence of the sensor and the sensor type is GAUGE or the sensor type is TEXT with COUNT operation (text is required).',
            ErrorCode.SENSOR_TYPE_UNSUPPORTED,
          );
        }
      }
    });

    const esSensor = new ElasticSearchSensor();
    esSensor.deviceType = input.deviceType;
    esSensor.sensorId = input.sensorId;
    esSensor.sensorType = type;
    esSensor.from = input.start;
    esSensor.to = input.end;

    return this.sensorService.sensorValueStatsHistory(
      esSensor,
      devices,
      input.option,
      input.interval,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DASHBOARD) &&
      ability.can(Action.VIEW, Subject.DEVICE),
  )
  @Subscription(() => SensorResponse)
  async sensorValueStatsChanged(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('deviceType') deviceType: DeviceType,
    @Args('sensorId') sensorId: string,
    @Args('days') days: number,
    @Args('operation') operation: ExtremeOperation,
  ) {
    // permission check: groupId is user's current group or sub-group
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(
        `You have no permission to view the group ${groupId}.`,
      );
    }

    const devices = await this.deviceService.getDevicesUnderGroup(
      groupId,
      deviceType,
      sensorId,
    );

    if (devices.length === 0) {
      throw new ApolloError(
        `Cannot find any devices for ${deviceType} in the given group.`,
        ErrorCode.DEVICE_NOT_FOUND,
      );
    }

    devices.forEach((d) => {
      const type = d.sensors.find(
        (sensor) => sensor.sensorId === sensorId,
      )?.type;
      if (type !== SensorType.GAUGE) {
        throw new ApolloError(
          'Please check the existence of the sensor and the sensor type is GAUGE.',
          ErrorCode.SENSOR_TYPE_UNSUPPORTED,
        );
      }
    });

    const redisTopic = `${
      Constants.PREFIX_FOR_SENSOR_VALUE_STATS_TOPIC
    }${groupId}/${deviceType}/${sensorId}/${operation}/${user._id.toHexString()}`;

    return this.sensorService.sensorValueStatsChanged(
      redisTopic,
      groupId,
      deviceType,
      sensorId,
      days,
      operation,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DEVICE) &&
      ability.can(Action.VIEW, Subject.IVS_EVENTS),
  )
  @Query()
  async sensorValueAtTime(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('sensorId') sensorId: string,
    @Args('time') time: Date,
  ): Promise<ISensorData> {
    // permission check: 'deviceId' must under user's current division
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to get sensor history for ${deviceId}.`,
      );
    }

    return this.sensorService.sensorValueAtTime(device, sensorId, time);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DASHBOARD) &&
      ability.can(Action.VIEW, Subject.DEVICE),
  )
  @Query()
  async gadgetForGenderAndAge(
    @CurrentUser() user: User,
    @Args('input') input: GadgetForGenderAndAgeInput,
  ): Promise<GenderAndAgeData> {
    // permission check: 'deviceId' must under user's current division
    const device = await this.deviceService.getDeviceById(input.deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to access ${input.deviceId}.`,
      );
    }

    // check the deviceType and recognitionType
    if (device.recognitionType() !== RecognitionType.HUMAN_FLOW_ADVANCE) {
      throw new ApolloError(
        `Please check the device type for ${device.name} is CAMERA and its recognition type is correct.`,
        ErrorCode.SENSOR_TYPE_UNSUPPORTED,
      );
    }

    return this.sensorService.gadgetForGenderAndAge(
      device,
      input.start,
      input.end,
      input.interval,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DASHBOARD) &&
      ability.can(Action.VIEW, Subject.DEVICE),
  )
  @Query()
  async sensorValuesMetricAggregation(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('sensorId') sensorId: string,
    @Args('start') start: Date,
    @Args('end') end: Date,
  ): Promise<MetricAggregationResponse> {
    // permission check: 'deviceId' must under user's current division
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to get sensor history for ${deviceId}.`,
      );
    }

    if (
      device.sensors.find((sensor) => sensor.sensorId === sensorId)?.type !==
      SensorType.GAUGE
    ) {
      throw new ApolloError(
        'Please check the existence of the sensor and the sensor type is GAUGE.',
        ErrorCode.SENSOR_TYPE_UNSUPPORTED,
      );
    }

    return this.sensorService.sensorValuesMetricAggregation(
      device,
      sensorId,
      start,
      end,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DASHBOARD) &&
      ability.can(Action.VIEW, Subject.DEVICE),
  )
  @Query()
  async sensorValuesAvgHistory(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('sensorId') sensorId: string,
    @Args('start') start: Date,
    @Args('end') end: Date,
    @Args('interval') interval: number,
  ): Promise<ISensorData[]> {
    // permission check: 'deviceId' must under user's current division
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to get sensor history for ${deviceId}.`,
      );
    }

    if (
      device.sensors.find((sensor) => sensor.sensorId === sensorId)?.type !==
      SensorType.GAUGE
    ) {
      throw new ApolloError(
        'Please check the existence of the sensor and the sensor type is GAUGE.',
        ErrorCode.SENSOR_TYPE_UNSUPPORTED,
      );
    }

    return this.sensorService.sensorValuesAvgHistory(
      device,
      sensorId,
      start,
      end,
      interval,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.INDOOR) &&
      ability.can(Action.VIEW, Subject.DASHBOARD) &&
      ability.can(Action.VIEW, Subject.DEVICE),
  )
  @Query()
  async sensorValuesRawHistory(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('sensorId') sensorId: string,
    @Args('start') start: Date,
    @Args('end') end: Date,
    @Args('from') from = 0,
    @Args('size') size = 10000, // elastic search 預設 size 最高是 10000，但是因為可以增多所以不檢查
  ): Promise<ISensorData[]> {
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to get sensor history for ${deviceId}.`,
      );
    }

    return this.sensorService.sensorValuesRawHistory(
      device,
      sensorId,
      start,
      end,
      from,
      size,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.INDOOR) &&
      ability.can(Action.VIEW, Subject.DASHBOARD) &&
      ability.can(Action.VIEW, Subject.DEVICE),
  )
  @Query()
  async multiSensorValuesRawHistory(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('sensorIds') sensorIds: string[],
    @Args('start') start: Date,
    @Args('end') end: Date,
    @Args('from') from = 0,
    @Args('size') size = 10000, // elastic search 預設 size 最高是 10000，但是因為可以增多所以不檢查
  ): Promise<MultiISensorData[]> {
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to get sensor history for ${deviceId}.`,
      );
    }

    return this.sensorService.multiSensorValuesRawHistory(
      device,
      sensorIds,
      start,
      end,
      from,
      size,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.DASHBOARD) &&
      ability.can(Action.VIEW, Subject.DEVICE),
  )
  @Query()
  async sensorValuesPredict(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('sensorId') sensorId: string,
    @Args('seasonalityPeriod') seasonalityPeriod: number,
    @Args('mode') mode: ExtremeOperation,
    @Args('start') start: Date,
    @Args('end') end: Date,
    @Args('interval') interval: number,
    @Args('pastInterval') pastInterval: number,
    @Args('lowerBound') lowerBound: number,
    @Args('upperBound') upperBound: number,
  ): Promise<ISensorData[]> {
    // permission check: 'deviceId' must under user's current division
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to get sensor for ${deviceId}.`,
      );
    }

    if (
      device.sensors.find((sensor) => sensor.sensorId === sensorId)?.type !==
      SensorType.GAUGE
    ) {
      throw new ApolloError(
        'Please check the existence of the sensor and the sensor type is GAUGE.',
        ErrorCode.SENSOR_TYPE_UNSUPPORTED,
      );
    }

    return this.sensorService.sensorValuesPredict(
      device,
      sensorId,
      seasonalityPeriod,
      mode,
      start,
      end,
      interval,
      pastInterval,
      lowerBound,
      upperBound,
    );
  }
}

@Resolver('ISensorData')
export class SensorDataResolver {
  @ResolveField()
  __resolveType(obj: ISensorData) {
    switch (obj.type) {
      case SensorType.GAUGE:
        return GaugeSensorData.name;
      case SensorType.SNAPSHOT:
        return SnapshotSensorData.name;
      case SensorType.TEXT:
        return TextSensorData.name;
      case SensorType.SWITCH:
        return SwitchSensorData.name;
      default:
        return TextSensorData.name;
    }
  }
}

@Resolver('SensorResponse')
export class SensorResponseResolver {
  constructor(private readonly deviceService: DeviceService) {}

  @ResolveField('deviceName', () => String)
  async deviceName(@Parent() response: SensorResponse) {
    return (await this.deviceService.getDeviceById(response.deviceId)).name;
  }
}
