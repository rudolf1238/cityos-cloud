import { Injectable, Logger } from '@nestjs/common';
import { AccountLinkEvent } from '@line/bot-sdk';
import { UserService } from 'src/modules/user/user.service';
import { LineClient } from '../../line.client';

@Injectable()
export class LineAccountLinkEventHandler {
  constructor(
    private readonly userService: UserService,
    private readonly lineClient: LineClient,
  ) {}

  private readonly logger = new Logger(LineAccountLinkEventHandler.name);

  async handleByEvent(event: AccountLinkEvent) {
    if (event.link.result === 'ok') {
      await this.userService.updateLineUserId(
        event.link.nonce,
        event.source.userId,
      );

      const user = await this.userService.getUserByLineID(event.source.userId);
      await this.lineClient.authenticationLinkByLINENotify(user);
    } else {
      this.logger.error(`Link failed: ${JSON.stringify(event)}`);
    }
  }
}
