import { WebhookRequestBody } from '@line/bot-sdk';
import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../auth/auth.decorator';
import { LineEventsHandler } from './line-handler/line.events.handler';

@Controller('linebot')
export class LineController {
  constructor(private readonly lineHandleEvent: LineEventsHandler) {}

  @Public()
  @Post('webhook')
  async lineWebhook(@Body() { events }: WebhookRequestBody) {
    return this.lineHandleEvent.handleEvent(events);
  }
}
