import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Permission, PermissionSchema } from 'src/models/permission';
import { RoleTemplate, RoleTemplateSchema } from 'src/models/role.template';
import { AbilityFactory } from './ability.factory';
import { PermissionResolver } from './permission.resolver';
import { PermissionService } from './permission.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Permission.name,
        schema: PermissionSchema,
        collection: 'permissions',
      },
      {
        name: RoleTemplate.name,
        schema: RoleTemplateSchema,
        collection: 'role_templates',
      },
    ]),
  ],
  providers: [AbilityFactory, PermissionResolver, PermissionService],
  exports: [AbilityFactory, PermissionService],
})
export class PermissionModule {}
