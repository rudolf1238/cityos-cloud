import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { LineAccountLinkEventHandler } from './line-handler/account-link/line.account.link.event.handler';
import { LineFollowEventHandler } from './line-handler/follow/line.follow.event.handler';
import { LineEventsHandler } from './line-handler/line.events.handler';
import { LineMessageEventHandler } from './line-handler/message/line.message.event.handler';
import { LineTextHandler } from './line-handler/message/types/line.text.handler';
import { LineClient } from './line.client';
import { LineController } from './line.controller';
import { LineResolver } from './line.resolver';
import { LineService } from './line.service';

@Module({
  controllers: [LineController],
  imports: [AuthModule, UserModule],
  providers: [
    LineEventsHandler,
    LineMessageEventHandler,
    LineTextHandler,
    LineAccountLinkEventHandler,
    LineFollowEventHandler,
    LineClient,
    LineResolver,
    LineService,
  ],
  exports: [LineService, LineClient],
})
export class LineModule {}
