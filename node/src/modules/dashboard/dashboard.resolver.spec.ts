import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { AbilityFactory } from '../permission/ability.factory';
import { PermissionService } from '../permission/permission.service';
import { DashboardResolver } from './dashboard.resolver';
import { DashboardService } from './dashboard.service';

const permissionServiceMock: () => MockType<PermissionService> = jest.fn(
  () => ({
    create: jest.fn(),
  }),
);

const mockDashboardModel = jest.fn();

describe('GadgetResolver', () => {
  let resolver: DashboardResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardResolver,
        DashboardService,
        {
          provide: PermissionService,
          useFactory: permissionServiceMock,
        },
        {
          provide: getModelToken('Dashboard'),
          useValue: mockDashboardModel,
        },
        AbilityFactory,
      ],
    }).compile();

    resolver = module.get<DashboardResolver>(DashboardResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
