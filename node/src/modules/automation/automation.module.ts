import { Module } from '@nestjs/common';
import { AutomationService } from './automation.service';
import {
  AutomationActionResolver,
  AutomationResolver,
} from './automation.resolver';
import {
  RuleAutomation,
  RuleAutomationSchema,
} from 'src/models/rule.automation';
import { GroupModule } from '../group/group.module';
import { DeviceModule } from '../device/device.module';
import { PermissionModule } from '../permission/permission.module';
import { UserModule } from '../user/user.module';
import {
  AutomationTrigger,
  AutomationTriggerSchema,
} from 'src/models/automation.trigger';
import {
  AutomationAction,
  AutomationActionSchema,
  DeviceAction,
  DeviceActionSchema,
  NotifyAction,
  NotifyActionSchema,
} from 'src/models/automation.action';
import {
  RuleSubscription,
  RuleSubscriptionSchema,
} from 'src/models/rule.subscription';
import { BullModule } from '@nestjs/bull';
import { AutomationProcessor } from './automation.processor';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { LineModule } from '../line/line.module';
import { MailModule } from '../mail/mail.module';
import { RuleAuditLog, RuleAuditLogSchema } from 'src/models/rule.audit.log';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: RuleAutomation.name,
        schema: RuleAutomationSchema,
        collection: 'automation_rules',
      },
      {
        name: AutomationTrigger.name,
        schema: AutomationTriggerSchema,
        collection: 'automation_triggers',
      },
      {
        name: AutomationAction.name,
        schema: AutomationActionSchema,
        collection: 'automation_actions',
        discriminators: [
          { name: NotifyAction.name, schema: NotifyActionSchema },
          { name: DeviceAction.name, schema: DeviceActionSchema },
        ],
      },
      {
        name: RuleSubscription.name,
        schema: RuleSubscriptionSchema,
        collection: 'automation_subscriptions',
      },
      {
        name: RuleAuditLog.name,
        schema: RuleAuditLogSchema,
        collection: 'automation_logs',
      },
    ]),
    BullModule.registerQueue({
      name: 'automation',
    }),
    GroupModule,
    DeviceModule,
    PermissionModule,
    UserModule,
    ChtiotClientModule,
    LineModule,
    MailModule,
  ],
  providers: [
    AutomationResolver,
    AutomationService,
    AutomationActionResolver,
    AutomationProcessor,
  ],
  exports: [AutomationService],
})
export class AutomationModule {}
