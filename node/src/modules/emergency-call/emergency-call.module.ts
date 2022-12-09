import { EmergencyCallService } from './emergency-call.service';
import { EmergencyCallResolver } from './emergency-call.resolver';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GoogleClientModule } from '../google-client/google-client/google-client.module';
import { PermissionModule } from '../permission/permission.module';
import { LogModule } from '../log/log.module';
import { GroupModule } from '../group/group.module';
import { UserModule } from '../user/user.module';
import { DeviceModule } from '../device/device.module';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import {
  EmergencyCallEvents,
  EmergencyCallEventsSchema,
} from 'src/models/emergency.call.events';
import {
  EmergencyCallEventLogs,
  EmergencyCallEventLogsSchema,
} from 'src/models/emergency.call.event.logs';
import {
  EmergencyCallContents,
  EmergencyCallContentsSchema,
} from 'src/models/emergency.call.contents';
import { EmergencyCallDb } from './emergency-call.repository';
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: EmergencyCallEvents.name,
        schema: EmergencyCallEventsSchema,
        collection: 'emergency_call_events',
      },
      {
        name: EmergencyCallEventLogs.name,
        schema: EmergencyCallEventLogsSchema,
        collection: 'emergency_call_event_logs',
      },
      {
        name: EmergencyCallContents.name,
        schema: EmergencyCallContentsSchema,
        collection: 'emergency_call_contents',
      },
    ]),
    forwardRef(() => GroupModule),
    forwardRef(() => UserModule),
    forwardRef(() => DeviceModule),
    GoogleClientModule,
    PermissionModule,
    DeviceModule,
    ChtiotClientModule,
    LogModule,
  ],
  providers: [EmergencyCallResolver, EmergencyCallService, EmergencyCallDb],
  exports: [EmergencyCallService],
})
export class EmergencyCallModule {}
