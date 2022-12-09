import { forwardRef, Module } from '@nestjs/common';
import { Group, GroupSchema } from 'src/models/group';
import { GroupService } from './group.service';
import { GroupResolver } from './group.resolver';
import { UserModule } from '../user/user.module';
import { PermissionModule } from '../permission/permission.module';
import { DeviceModule } from '../device/device.module';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { LogModule } from '../log/log.module';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Group.name,
        schema: GroupSchema,
        collection: 'groups',
      },
    ]),
    forwardRef(() => UserModule),
    forwardRef(() => DeviceModule),
    PermissionModule,
    ChtiotClientModule,
    LogModule,
  ],
  providers: [GroupResolver, GroupService],
  exports: [GroupService],
})
export class GroupModule {}
