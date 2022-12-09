import { WebhookEvent } from '@line/bot-sdk';
import { Injectable, Logger } from '@nestjs/common';
import { LineAccountLinkEventHandler } from './account-link/line.account.link.event.handler';
import { LineFollowEventHandler } from './follow/line.follow.event.handler';
import { LineMessageEventHandler } from './message/line.message.event.handler';

@Injectable()
export class LineEventsHandler {
  constructor(
    private readonly messageHandler: LineMessageEventHandler,
    private readonly accountLinkEventHandler: LineAccountLinkEventHandler,
    private readonly lineFollowEventHandler: LineFollowEventHandler,
  ) {}

  private readonly logger = new Logger(LineEventsHandler.name);

  handleEvent(events: WebhookEvent[]) {
    return events.map((event) => {
      switch (event.type) {
        case 'message': {
          return this.messageHandler.handleByEvent(event);
        }
        case 'accountLink': {
          return this.accountLinkEventHandler.handleByEvent(event);
        }
        case 'follow': {
          return this.lineFollowEventHandler.handleByEvent(event);
        }
        case 'unfollow': {
          this.logger.log(`unfollow: ${JSON.stringify(event)}`);
          // TODO: implement it!!
          break;
        }
        case 'join': {
          this.logger.log(`join: ${JSON.stringify(event)}`);
          // TODO: implement it!!
          break;
        }
        case 'leave': {
          this.logger.log(`leave: ${JSON.stringify(event)}`);
          // TODO: implement it!!
          break;
        }
        case 'postback': {
          this.logger.log(`postback: ${JSON.stringify(event)}`);
          // TODO: implement it!!
          break;
        }
        case 'beacon': {
          this.logger.log(`beacon: ${JSON.stringify(event)}`);
          // TODO: implement it!!
          break;
        }
        default: {
          this.logger.log(`default: ${JSON.stringify(event)}`);
          // TODO: implement it!!
          break;
        }
      }
    });
  }
}
