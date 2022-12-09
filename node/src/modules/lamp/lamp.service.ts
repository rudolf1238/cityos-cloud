import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ApolloError } from 'apollo-server-express';
import { ErrorCode } from 'src/models/error.code';
import {
  LightControl,
  LightSensorCondition,
  Lamp,
  Schedule,
  LampDocument,
} from 'src/models/lamp';
import {
  DeviceType,
  LightScheduleInput,
  LightSensorConditionInput,
  ScheduleInput,
} from 'src/graphql.schema';
import { DateTime } from 'luxon';
import { Device } from 'src/models/device';
import { Agenda } from 'agenda';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import { DeviceService } from '../device/device.service';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class LampService implements OnModuleInit {
  constructor(
    @InjectModel(Lamp.name)
    private readonly lampModel: Model<LampDocument>,
    @Inject(forwardRef(() => DeviceService))
    private deviceService: DeviceService,
    private readonly chtiotClientService: ChtiotClientService,
    private readonly configService: ConfigService,
  ) {}

  private readonly logger = new Logger(LampService.name);

  private agenda = new Agenda({
    db: {
      address: this.configService.get<string>('MONGODB_URI'),
      collection: 'agenda_lamp_schedule_jobs',
    },
  });

  async onModuleInit() {
    void this.agenda.start();
    this.agenda.define('updateScheduleOnIOT', async (job, done) => {
      this.logger.log(
        `updateScheduleOnIOT for ${JSON.stringify(job.attrs.data)}`,
      );
      const { deviceId } = job.attrs.data;

      // update agenda
      const lamp = (await this.deviceService.getDeviceById(
        deviceId as string,
      )) as Lamp;
      await this.updateScheduleOnIOT(lamp);
      done();

      // remvoe the current job
      void job.remove();
    });
  }

  async updateLampSchedule(
    deviceId: string,
    lightScheduleInput: LightScheduleInput,
  ): Promise<boolean> {
    this.logger.log(
      `update lamp[${deviceId}] schedule, input = ${JSON.stringify(
        lightScheduleInput,
      )}`,
    );

    // make sure the manualScheduleInput is valid
    if (lightScheduleInput.manualScheduleInput?.schedules) {
      const isValid = this.isSchedulesValid(
        lightScheduleInput.manualScheduleInput.schedules,
      );
      if (!isValid) {
        throw new ApolloError(
          `Brightness for schedule in manualScheduleInput should be 0, 20, 40, 60, 80, 100% (non-duplicated), and at least one 0%.`,
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      }
    }

    // make sure the lightSensorInput is valid
    if (lightScheduleInput.lightSensorInput?.lightSensorConditionInput) {
      const isValid = this.isLightSensorValid(
        lightScheduleInput.lightSensorInput?.lightSensorConditionInput,
      );
      if (!isValid) {
        throw new ApolloError(
          `LightSensorConditionInput in the LightSensorInput is not correct. Please provide at least one (lessThan, brightness) and brightness should be between [0, 100].`,
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      }
    }

    const device = (await this.deviceService.getDeviceById(deviceId)) as Lamp;
    if (device === null) {
      throw new ApolloError(
        `Cannot find the device - ${deviceId} in the database.`,
        ErrorCode.DEVICE_NOT_FOUND,
      );
    }

    if (device.type !== DeviceType.LAMP) {
      throw new ApolloError(
        'The device type is not correct, and please check the deviceId again.',
        ErrorCode.DEVICE_TYPE_INCORRECT,
      );
    }

    // update the light schedule in the CityOS
    if (lightScheduleInput.lightSensorInput?.enableLightSensor !== undefined)
      device.lightSchedule.lightSensor.enableLightSensor =
        lightScheduleInput.lightSensorInput.enableLightSensor;
    if (
      lightScheduleInput.lightSensorInput?.lightSensorConditionInput !==
      undefined
    ) {
      device.lightSchedule.lightSensor.lightSensorCondition =
        lightScheduleInput.lightSensorInput.lightSensorConditionInput.flatMap(
          (it) => {
            const lightSensorCondition = new LightSensorCondition();
            lightSensorCondition.lessThan = it.lessThan;
            lightSensorCondition.brightness = it.brightness;
            return lightSensorCondition;
          },
        );
    }
    if (
      lightScheduleInput.manualScheduleInput?.enableManualSchedule !== undefined
    )
      device.lightSchedule.manualSchedule.enableManualSchedule =
        lightScheduleInput.manualScheduleInput.enableManualSchedule;
    if (lightScheduleInput.manualScheduleInput?.schedules !== undefined) {
      device.lightSchedule.manualSchedule.schedules =
        lightScheduleInput.manualScheduleInput.schedules.flatMap((it) => {
          const schedule = new Schedule();
          schedule.startMonth = it.startMonth;
          schedule.startDay = it.startDay;
          schedule.lightControls = it.lightControlInputs.flatMap((input) => {
            const lightControl = new LightControl();
            lightControl.hour = input.hour;
            lightControl.minute = input.minute;
            lightControl.brightness = input.brightness;
            return lightControl;
          });
          return schedule;
        });
    }

    // update the manual schedule on the CHT IOT, and arrange the next update by agenda
    await this.updateScheduleOnIOT(device);

    // update the light sensor setting on the CHT IOT
    const environment = await this.getLightSensorDevice(device);
    if (environment) {
      const expressionIds = await this.applyLightSensor(device, environment);
      device.lightSchedule.lightSensor.expressionIds = expressionIds;
    }

    return !!(await this.lampModel.findByIdAndUpdate(device._id, device, {
      useFindAndModify: false,
    }));
  }

  private isSchedulesValid(inputs: ScheduleInput[]): boolean {
    return inputs.every((schedule) => {
      let hasZeroBrightness = false;

      const validBrightness = schedule.lightControlInputs.every(
        (lightControl) => {
          if (lightControl.brightness >= 0 && lightControl.brightness <= 100) {
            // must have 0% brightness
            if (lightControl.brightness === 0) {
              hasZeroBrightness = true;
            }
            // brightness should be 0, 20, 40, 60, 80, 100
            if (lightControl.brightness % 20 === 0) {
              return true;
            }
          }
          return false;
        },
      );

      // check duplicated
      const allBrightness = schedule.lightControlInputs.flatMap(
        (it) => it.brightness,
      );
      if (allBrightness.length !== new Set(allBrightness).size) {
        return false;
      }
      return hasZeroBrightness && validBrightness;
    });
  }

  private isLightSensorValid(inputs?: LightSensorConditionInput[]): boolean {
    if (inputs?.length > 0) {
      return inputs.every(
        (condition) => condition.brightness >= 0 && condition.brightness <= 100,
      );
    }
    return false;
  }

  async updateScheduleOnIOT(lamp: Lamp): Promise<boolean> {
    const projectKey = await this.deviceService.getProjectKeyById(
      lamp.deviceId,
    );

    // sort the schedules
    const { schedules } = lamp.lightSchedule.manualSchedule;
    const { timeZoneId } = lamp.timezone;
    schedules.sort((a, b) => {
      if (a.startMonth - b.startMonth === 0) {
        return a.startDay - b.startDay;
      }
      return a.startMonth - b.startMonth;
    });

    // get the correct schedule
    const currect = DateTime.now().setZone(lamp.timezone.timeZoneId);

    let selectedScheduleIndex = -1;
    for (let i = 0; i < schedules.length; i += 1) {
      const from = DateTime.fromObject(
        {
          month: schedules[i].startMonth,
          day: schedules[i].startDay,
        },
        {
          zone: timeZoneId,
        },
      );
      const to = schedules[i + 1]
        ? DateTime.fromObject(
            {
              month: schedules[i + 1].startMonth,
              day: schedules[i + 1].startDay,
            },
            {
              zone: timeZoneId,
            },
          )
        : null;
      if (to != null) {
        if (currect.ordinal >= from.ordinal && currect.ordinal < to.ordinal) {
          selectedScheduleIndex = i;
          break;
        }
      }
    }
    const schedule =
      selectedScheduleIndex !== -1
        ? schedules[selectedScheduleIndex]
        : schedules[schedules.length - 1];
    this.logger.log(
      `Using this schedule: \n${JSON.stringify(schedule, null, 2)}`,
    );

    // schedule the next agenda to update the lamp schedule on the IOT
    const { enableManualSchedule } = lamp.lightSchedule.manualSchedule;
    if (enableManualSchedule && schedules.length > 1) {
      const nextIndex = (selectedScheduleIndex + 1) % schedules.length;
      const nextSchedule = schedules[nextIndex];
      const triggerYear = nextIndex === 0 ? currect.year + 1 : currect.year;
      const next = DateTime.fromObject(
        {
          year: triggerYear,
          month: nextSchedule.startMonth,
          day: nextSchedule.startDay,
        },
        {
          zone: timeZoneId,
        },
      );
      this.logger.log(
        `Schedule the next on ${JSON.stringify(next.toJSDate(), null, 2)}`,
      );

      // remove previous agenda to avoid the duplicated job for the same deviceId
      await this.agenda.cancel({
        data: { deviceId: lamp.deviceId },
      });
      await this.agenda.schedule(next.toJSDate(), 'updateScheduleOnIOT', {
        deviceId: lamp.deviceId,
      });
    }

    this.logger.debug(
      'getBrandByDevice',
      this.deviceService.getBrandByDevice(lamp),
    );

    switch (this.deviceService.getBrandByDevice(lamp)) {
      case 'delta':
        return this.chtiotClientService.updateDeltaLampSchedule(
          projectKey,
          lamp.deviceId,
          enableManualSchedule ? schedule.lightControls : [],
        );
      default:
        return this.chtiotClientService.updateLampSchedule(
          projectKey,
          lamp.deviceId,
          enableManualSchedule ? schedule.lightControls : [],
        );
    }
  }

  private async applyLightSensor(
    lamp: Lamp,
    environment: Device,
  ): Promise<string[]> {
    const projectKey = await this.deviceService.getProjectKeyById(
      environment.deviceId,
    );

    // delete the previous rules setting on CHT IOT platform
    const pExpressionIds = lamp.lightSchedule.lightSensor.expressionIds;
    this.logger.debug(
      `pExpressionIds(delete first) = ${JSON.stringify(pExpressionIds)}`,
    );
    if (pExpressionIds != null) {
      await this.chtiotClientService.deleteExpression(
        projectKey,
        pExpressionIds,
      );
    }

    // add the new rules setting on CHT IOT
    if (lamp.lightSchedule.lightSensor?.enableLightSensor) {
      return this.chtiotClientService.addExpression(
        projectKey,
        lamp,
        environment,
      );
    }
    return [];
  }

  private async getLightSensorDevice(device: Lamp): Promise<Device> {
    const relatedDevices = await this.deviceService.getRelatedDevices(
      device.uri,
    );
    return relatedDevices.find((it) => it.type === DeviceType.ENVIRONMENT);
  }
}
