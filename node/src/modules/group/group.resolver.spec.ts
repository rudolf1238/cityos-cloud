import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { User } from 'src/models/user';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { DeviceService } from '../device/device.service';
import { LogService } from '../log/log.service';
import { AbilityFactory } from '../permission/ability.factory';
import { UserService } from '../user/user.service';
import { GroupResolver } from './group.resolver';
import { GroupService } from './group.service';

const userServiceMock: () => MockType<UserService> = jest.fn(() => ({
  findUserById: jest.fn(() => {
    return new User();
  }),
  findUser: jest.fn(() => new User()),
}));

const deviceServiceMock: () => MockType<DeviceService> = jest.fn(() => ({
  getDeviceById: jest.fn(),
  searchDevices: jest.fn(),
}));

const logServiceMock: () => MockType<LogService> = jest.fn(() => ({
  insertEvent: jest.fn(),
}));

describe('GroupResolver', () => {
  let resolver: GroupResolver;

  beforeEach(async () => {
    const mockGroupModel = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      imports: [ChtiotClientModule, ConfigModule],
      providers: [
        GroupResolver,
        GroupService,
        {
          provide: getModelToken('Group'),
          useValue: mockGroupModel,
        },
        {
          provide: UserService,
          useFactory: userServiceMock,
        },
        {
          provide: DeviceService,
          useFactory: deviceServiceMock,
        },
        {
          provide: LogService,
          useFactory: logServiceMock,
        },
        AbilityFactory,
      ],
    }).compile();

    resolver = module.get<GroupResolver>(GroupResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
