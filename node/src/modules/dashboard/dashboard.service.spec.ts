import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { AbilityFactory } from '../permission/ability.factory';
import { PermissionService } from '../permission/permission.service';
import { DashboardService } from './dashboard.service';

const permissionServiceMock: () => MockType<PermissionService> = jest.fn(
  () => ({
    create: jest.fn(),
  }),
);

const mockDashboardModel = jest.fn();

describe('GadgetService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
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

    service = module.get<DashboardService>(DashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
