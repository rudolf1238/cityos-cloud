import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  Action,
  PermissionInput,
  RoleTemplate,
  Subject,
} from 'src/graphql.schema';
import { AppAbility } from './ability.factory';
import { PermissionGuard } from './permission.guard';
import { CheckPermissions } from './permission.handler';
import { PermissionService } from './permission.service';

@Resolver('Permission')
export class PermissionResolver {
  constructor(private readonly permissionService: PermissionService) {}

  @Query()
  async roleTemplates(): Promise<RoleTemplate[]> {
    const roleTemplates = await this.permissionService.getAllRoleTemplates();
    return roleTemplates.flatMap((it) => it.toApolloRoleTemplate());
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.ROLE_TEMPLATE),
  )
  @Mutation()
  async createRoleTemplate(
    @Args('name') name: string,
    @Args('permissionInputs') permissionInputs: PermissionInput[],
  ): Promise<RoleTemplate> {
    const roleTemplate = await this.permissionService.createRoleTemplate(
      name,
      permissionInputs,
    );
    return roleTemplate.toApolloRoleTemplate();
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.ROLE_TEMPLATE),
  )
  @Mutation()
  async deleteRoleTemplate(
    @Args('templateId') templateId: string,
  ): Promise<boolean> {
    return this.permissionService.deleteRoleTemplate(templateId);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.ROLE_TEMPLATE),
  )
  @Mutation()
  async editRoleTemplate(
    @Args('templateId') templateId: string,
    @Args('name') name?: string,
    @Args('permissionInputs') permissionInputs?: PermissionInput[],
  ): Promise<RoleTemplate> {
    const roleTemplate = await this.permissionService.editRoleTemplate(
      templateId,
      name,
      permissionInputs,
    );
    return roleTemplate.toApolloRoleTemplate();
  }
}
