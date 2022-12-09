import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Action, DashboardConfig, Subject } from 'src/graphql.schema';
import { User } from 'src/models/user';
import { CurrentUser } from '../auth/auth.decorator';
import { AppAbility } from '../permission/ability.factory';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { DashboardService } from './dashboard.service';

@Resolver('Dashboard')
export class DashboardResolver {
  constructor(private readonly dashboardService: DashboardService) {}

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.DASHBOARD),
  )
  @Query()
  async readDashboard(@CurrentUser() user: User): Promise<DashboardConfig[]> {
    return this.dashboardService.readDashboard(user);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.DASHBOARD),
  )
  @Mutation()
  async saveDashboard(
    @CurrentUser() user: User,
    @Args('index') index: number,
    @Args('config') config: string,
  ): Promise<boolean> {
    return this.dashboardService.saveDashboard(user, index, config);
  }
}
