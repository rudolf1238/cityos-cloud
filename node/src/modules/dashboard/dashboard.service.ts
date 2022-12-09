import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Dashboard,
  DashboardConfig,
  DashboardDocument,
} from 'src/models/dashboard';
import { User } from 'src/models/user';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Dashboard.name)
    private readonly dashboardModel: Model<DashboardDocument>,
  ) {}

  private readonly logger = new Logger(DashboardService.name);

  async saveDashboard(
    user: User,
    index: number,
    config: string,
  ): Promise<boolean> {
    const group = user.groupInUse();
    this.logger.log(
      `${user.email} saveDashboard for ${group.id} - (index, config) = (${index}, ${config})`,
    );
    const dashboard = await this.dashboardModel.findOne({
      user: user._id,
      group: group._id,
    });
    if (dashboard) {
      const oldConfig = dashboard.configs.find((c) => c.index === index);
      if (oldConfig) {
        oldConfig.config = config;
      } else {
        const dashboardConfig = new DashboardConfig();
        dashboardConfig.index = index;
        dashboardConfig.config = config;
        dashboard.configs.push(dashboardConfig);
      }
      return !!(await this.dashboardModel.findOneAndUpdate(
        {
          user: user._id,
          group: group._id,
        },
        {
          configs: dashboard.configs,
        },
      ));
    } else {
      return !!(await this.createDashboard(user, index, config));
    }
  }

  async readDashboard(user: User): Promise<DashboardConfig[]> {
    const group = user.groupInUse();
    const dashboard = await this.dashboardModel.findOne({
      user: user._id,
      group: group._id,
    });
    if (dashboard) {
      return dashboard.configs;
    } else {
      return [];
    }
  }

  private createDashboard(
    user: User,
    index: number,
    config: string,
  ): Promise<Dashboard> {
    const group = user.groupInUse();

    const configs: DashboardConfig[] = [];
    const dashboardConfig = new DashboardConfig();
    dashboardConfig.index = index;
    dashboardConfig.config = config;
    configs.push(dashboardConfig);

    const newDashboard = new Dashboard();
    newDashboard.user = user;
    newDashboard.group = group;
    newDashboard.configs = configs;

    return this.dashboardModel.create(newDashboard);
  }
}
