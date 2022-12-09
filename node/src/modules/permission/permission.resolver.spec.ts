import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AbilityFactory } from './ability.factory';
import { PermissionResolver } from './permission.resolver';
import { PermissionService } from './permission.service';

describe('PermissionResolver', () => {
  let resolver: PermissionResolver;

  beforeEach(async () => {
    const mockPermissionModel = jest.fn();
    const mockRoleTemplateModel = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionResolver,
        PermissionService,
        {
          provide: getModelToken('Permission'),
          useValue: mockPermissionModel,
        },
        {
          provide: getModelToken('RoleTemplate'),
          useValue: mockRoleTemplateModel,
        },
        AbilityFactory,
      ],
    }).compile();

    resolver = module.get<PermissionResolver>(PermissionResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
