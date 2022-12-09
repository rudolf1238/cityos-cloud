import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PermissionService } from './permission.service';

describe('PermissionService', () => {
  let service: PermissionService;

  beforeEach(async () => {
    const mockPermissionModel = jest.fn();
    const mockRoleTemplateModel = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionService,
        {
          provide: getModelToken('Permission'),
          useValue: mockPermissionModel,
        },
        {
          provide: getModelToken('RoleTemplate'),
          useValue: mockRoleTemplateModel,
        },
      ],
    }).compile();

    service = module.get<PermissionService>(PermissionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
