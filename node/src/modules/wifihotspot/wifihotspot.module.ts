import { forwardRef, Module } from '@nestjs/common';
import { WifihotspotResolver } from '../wifihotspot/wifihotspot.resolver';
import { WifihotspotService } from './wifihotspot.service';
import { DeviceModule } from '../device/device.module';
import { UserModule } from '../user/user.module';
import { GroupModule } from '../group/group.module';
import { PermissionModule } from '../permission/permission.module';
import { Device, DeviceSchema } from 'src/models/device';
// import { Lamp, LampSchema } from 'src/models/lamp';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/models/user';
import { HttpModule } from '@nestjs/axios';
import { ChtwifiplusClientModule } from '../chtwifiplus-client/chtwifiplus-client.module';
import { Group, GroupSchema } from 'src/models/group';
import { WifihotspotRepository } from './wifihotspot.repository';
import { LogModule } from '../log/log.module';
@Module({
  imports: [
    HttpModule,
    MongooseModule.forFeature([
      {
        name: Device.name,
        schema: DeviceSchema,
        collection: 'devices',
        // discriminators: [{ name: Lamp.name, schema: LampSchema }],
      },
      {
        name: User.name,
        schema: UserSchema,
        collection: 'users',
      },
      {
        name: Group.name,
        schema: GroupSchema,
        collection: 'groups',
      },
    ]),
    forwardRef(() => DeviceModule),
    forwardRef(() => UserModule),
    forwardRef(() => GroupModule),
    PermissionModule,
    ChtwifiplusClientModule,
    LogModule,
  ],
  providers: [WifihotspotResolver, WifihotspotService, WifihotspotRepository],
  exports: [WifihotspotService],
})
export class WifihotspotModule {}
