import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Dashboard, DashboardSchema } from 'src/models/dashboard';
import { LogModule } from '../log/log.module';
import { PermissionModule } from '../permission/permission.module';
import { DashboardResolver } from './dashboard.resolver';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Dashboard.name,
        schema: DashboardSchema,
        collection: 'dashboard',
      },
    ]),
    PermissionModule,
    LogModule,
  ],
  providers: [DashboardService, DashboardResolver],
})
export class DashboardModule {}
