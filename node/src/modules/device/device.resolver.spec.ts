import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import { GoogleClientService } from '../google-client/google-client/google-client.service';
import { GroupService } from '../group/group.service';
import { SensorService } from '../sensor/sensor.service';
import { UserService } from '../user/user.service';
import { DeviceResolver } from './device.resolver';
import { DeviceService } from './device.service';
import { AbilityFactory } from '../permission/ability.factory';
import { LampService } from '../lamp/lamp.service';
import { LogService } from '../log/log.service';
import { ElasticsearchSensorService } from '../elasticsearch-sensor/elasticsearch-sensor.service';

const groupServiceMock: () => MockType<GroupService> = jest.fn(() => ({
  create: jest.fn(),
}));

const sensorServiceMock: () => MockType<SensorService> = jest.fn(() => ({
  create: jest.fn(),
  updateSensor: jest.fn(),
}));

const chtiotClientServiceMock: () => MockType<ChtiotClientService> = jest.fn(
  () => ({
    editDevice: jest.fn(),
    updateSensor: jest.fn(),
  }),
);

const googleClientServiceMock: () => MockType<GoogleClientService> = jest.fn(
  () => ({
    getTimeZone: jest.fn(),
  }),
);

const userServiceMock: () => MockType<UserService> = jest.fn(() => ({
  findUserById: jest.fn(),
  findUser: jest.fn(),
}));

const lampServiceMock: () => MockType<LampService> = jest.fn(() => ({
  updateLampSchedule: jest.fn(),
}));

const logServiceMock: () => MockType<LogService> = jest.fn(() => ({
  insertEvent: jest.fn(),
}));

const elasticsearchSensorServiceMock: () => MockType<ElasticsearchSensorService> =
  jest.fn(() => ({
    elasticSearchSetting: jest.fn(),
  }));

describe('DeviceResolver', () => {
  let resolver: DeviceResolver;

  beforeEach(async () => {
    const mockDeviceModel = jest.fn();
    const mocklampModel = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule],
      providers: [
        DeviceResolver,
        DeviceService,
        {
          provide: getModelToken('Device'),
          useValue: mockDeviceModel,
        },
        {
          provide: getModelToken('Lamp'),
          useValue: mocklampModel,
        },
        {
          provide: GroupService,
          useFactory: groupServiceMock,
        },
        {
          provide: SensorService,
          useFactory: sensorServiceMock,
        },
        {
          provide: ChtiotClientService,
          useFactory: chtiotClientServiceMock,
        },
        {
          provide: GoogleClientService,
          useFactory: googleClientServiceMock,
        },
        {
          provide: UserService,
          useFactory: userServiceMock,
        },
        {
          provide: LampService,
          useFactory: lampServiceMock,
        },
        {
          provide: LogService,
          useFactory: logServiceMock,
        },
        {
          provide: ElasticsearchSensorService,
          useFactory: elasticsearchSensorServiceMock,
        },
        AbilityFactory,
      ],
    }).compile();

    resolver = module.get<DeviceResolver>(DeviceResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
