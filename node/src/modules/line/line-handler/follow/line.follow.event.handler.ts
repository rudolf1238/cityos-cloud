import { Injectable } from '@nestjs/common';
import { FollowEvent } from '@line/bot-sdk';
import { LineClient } from '../../line.client';

@Injectable()
export class LineFollowEventHandler {
  constructor(private readonly lineClient: LineClient) {}

  async handleByEvent(event: FollowEvent) {
    const lineUserId = event.source.userId;
    await this.lineClient.sendBindingMessage(lineUserId);
  }
}
