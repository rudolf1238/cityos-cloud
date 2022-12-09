import { forwardRef, Inject, UseGuards } from '@nestjs/common';
import {
  Args,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { ForbiddenError } from 'apollo-server-express';
import { Constants } from 'src/constants';
import {
  Device,
  DeviceType,
  LightScheduleInput,
  Lamp,
  Action,
  Subject,
} from 'src/graphql.schema';
import { User } from 'src/models/user';
import { CurrentUser } from '../auth/auth.decorator';
import { DeviceService } from '../device/device.service';
import { AppAbility } from '../permission/ability.factory';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { LampService } from './lamp.service';

@Resolver('Lamp')
export class LampResolver {
  constructor(
    @Inject(forwardRef(() => DeviceService))
    private deviceService: DeviceService,
    private readonly lampService: LampService,
  ) {}

  @ResolveField('related', () => [Device])
  async related(@Parent() lamp: Lamp) {
    const related = await this.deviceService.getRelatedDevices(lamp.uri);
    return related.flatMap((it) => it.toApolloDevice());
  }

  @ResolveField('hasLightSensor', () => Boolean)
  async hasLightSensor(@Parent() lamp: Lamp) {
    const related = await this.related(lamp);

    return related
      .filter((device) => device.type === DeviceType.ENVIRONMENT)
      .some((filterDevice) =>
        filterDevice.sensors.some(
          (sensor) =>
            sensor.sensorId === Constants.ID_ENVIRONMENT_RAY_RADIATION,
        ),
      );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.MODIFY, Subject.LIGHTMAP),
  )
  @Mutation(() => Boolean)
  async updateLampSchedule(
    @CurrentUser() user: User,
    @Args('deviceId') deviceId: string,
    @Args('lightScheduleInput') lightScheduleInput: LightScheduleInput,
  ): Promise<boolean> {
    // permission check: 'deviceId' must under user's current division
    const device = await this.deviceService.getDeviceById(deviceId);
    if (!(await this.deviceService.isDeviceUnder(user, device))) {
      throw new ForbiddenError(
        `You have no permission to update schedule for ${deviceId}.`,
      );
    }

    return this.lampService.updateLampSchedule(deviceId, lightScheduleInput);
  }
}
