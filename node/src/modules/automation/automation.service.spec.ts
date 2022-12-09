import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { DeviceService } from '../device/device.service';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { AutomationService } from './automation.service';

const deviceServiceMock: () => MockType<DeviceService> = jest.fn(() => ({
  getDeviceById: jest.fn(),
  searchDevices: jest.fn(),
}));

const userServiceMock: () => MockType<UserService> = jest.fn(() => ({
  findUser: jest.fn(),
}));

const groupServiceMock: () => MockType<GroupService> = jest.fn(() => ({
  getGroup: jest.fn(),
}));

describe('AutomationService', () => {
  let service: AutomationService;

  beforeEach(async () => {
    const mockRuleModel = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        BullModule.registerQueue({
          name: 'automation',
        }),
      ],
      providers: [
        AutomationService,
        {
          provide: getModelToken('RuleAutomation'),
          useValue: mockRuleModel,
        },
        {
          provide: getModelToken('AutomationTrigger'),
          useValue: mockRuleModel,
        },
        {
          provide: getModelToken('NotifyAction'),
          useValue: mockRuleModel,
        },
        {
          provide: getModelToken('DeviceAction'),
          useValue: mockRuleModel,
        },
        {
          provide: getModelToken('RuleSubscription'),
          useValue: mockRuleModel,
        },
        {
          provide: getModelToken('RuleAuditLog'),
          useValue: mockRuleModel,
        },
        {
          provide: DeviceService,
          useFactory: deviceServiceMock,
        },
        {
          provide: UserService,
          useFactory: userServiceMock,
        },
        {
          provide: GroupService,
          useFactory: groupServiceMock,
        },
      ],
    }).compile();

    service = module.get<AutomationService>(AutomationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
