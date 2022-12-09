/* eslint-disable no-console */
import { Test, TestingModule } from '@nestjs/testing';
import { ApolloError } from 'apollo-server-express';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { ErrorCode } from 'src/models/error.code';
import {
  LightControlInput,
  LightScheduleInput,
  ManualScheduleInput,
  ScheduleInput,
} from 'src/graphql.schema';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { DeviceService } from '../device/device.service';
import { LampService } from './lamp.service';
import { ConfigModule } from '@nestjs/config';

const deviceServiceMock: () => MockType<DeviceService> = jest.fn(() => ({
  getDeviceById: jest.fn(),
  searchDevices: jest.fn(),
}));

describe('LampService', () => {
  let service: LampService;

  beforeEach(async () => {
    const mockLampModel = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ChtiotClientModule,
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '../env/cityos_env',
        }),
      ],
      providers: [
        LampService,
        {
          provide: getModelToken('Lamp'),
          useValue: mockLampModel,
        },
        {
          provide: DeviceService,
          useFactory: deviceServiceMock,
        },
      ],
    }).compile();

    service = module.get<LampService>(LampService);
  });

  it('should throw error if the schedule provided is illegal by updateLampSchedule', async () => {
    expect(service).toBeDefined();

    const lightScheduleInput = new LightScheduleInput();
    const manualScheduleInput = new ManualScheduleInput();
    const lightControlInput = new LightControlInput();
    lightControlInput.brightness = 100;

    const scheduleInput = new ScheduleInput();
    scheduleInput.startMonth = 1;
    scheduleInput.startDay = 1;
    scheduleInput.lightControlInputs = [lightControlInput];
    manualScheduleInput.schedules = [scheduleInput];
    lightScheduleInput.manualScheduleInput = manualScheduleInput;

    try {
      console.log(
        `Using schedule: ${JSON.stringify(lightScheduleInput, null, 2)}`,
      );
      await service.updateLampSchedule('deviceId', lightScheduleInput);
      throw new Error();
    } catch (error) {
      if (error instanceof ApolloError) {
        expect(error.extensions.code).toEqual(
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      } else {
        throw new Error(
          "It shoulds throws error if you don't provide the brightness 0% in each schedule.",
        );
      }
    }

    lightControlInput.brightness = 10;
    try {
      console.log(
        `Using schedule: ${JSON.stringify(lightScheduleInput, null, 2)}`,
      );
      await service.updateLampSchedule('deviceId', lightScheduleInput);
      throw new Error();
    } catch (error) {
      if (error instanceof ApolloError) {
        expect(error.extensions.code).toEqual(
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      } else {
        throw new Error(
          "It shoulds throws error if you don't provide the correct brightness in each schedule.",
        );
      }
    }
  });
});
