import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { DeviceService } from '../device/device.service';
import { GroupService } from '../group/group.service';
import { AbilityFactory } from '../permission/ability.factory';
import { UserService } from '../user/user.service';
import { AutomationResolver } from './automation.resolver';
import { AutomationService } from './automation.service';

const groupServiceMock: () => MockType<GroupService> = jest.fn(() => ({
  create: jest.fn(),
}));

const deviceServiceMock: () => MockType<DeviceService> = jest.fn(() => ({
  searchDevices: jest.fn(),
}));

const userServiceMock: () => MockType<UserService> = jest.fn(() => ({
  findUser: jest.fn(),
}));

describe('AutomationResolver', () => {
  let resolver: AutomationResolver;
  const mockRuleModel = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        BullModule.registerQueue({
          name: 'automation',
        }),
      ],
      providers: [
        AutomationResolver,
        AutomationService,
        {
          provide: GroupService,
          useFactory: groupServiceMock,
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
        AbilityFactory,
      ],
    }).compile();

    resolver = module.get<AutomationResolver>(AutomationResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
