import { Injectable, Logger } from '@nestjs/common';
import { LineTextHandler } from './types/line.text.handler';
import { MessageEvent } from '@line/bot-sdk';

@Injectable()
export class LineMessageEventHandler {
  private readonly logger = new Logger(LineMessageEventHandler.name);

  constructor(private readonly textHandler: LineTextHandler) {}

  async handleByEvent(event: MessageEvent) {
    switch (event.message.type) {
      case 'text': {
        const { replyToken } = event;
        const { text } = event.message;
        const lineUserId = event.source.userId;
        await this.textHandler.handleByMessageType(
          lineUserId,
          text,
          replyToken,
        );
        break;
      }
      case 'image': {
        this.logger.log(`image: ${JSON.stringify(event)}`);
        // TODO: implement it!!
        break;
      }
      case 'video': {
        this.logger.log(`video: ${JSON.stringify(event)}`);
        // TODO: implement it!!
        break;
      }
      case 'audio': {
        this.logger.log(`audio: ${JSON.stringify(event)}`);
        // TODO: implement it!!
        break;
      }
      case 'location': {
        this.logger.log(`location: ${JSON.stringify(event)}`);
        // TODO: implement it!!
        break;
      }
      case 'sticker': {
        this.logger.log(`sticker: ${JSON.stringify(event)}`);
        // TODO: implement it!!
        break;
      }
      default: {
        this.logger.log(`default: ${JSON.stringify(event)}`);
        // TODO: implement it!!
        break;
      }
    }
  }
}
