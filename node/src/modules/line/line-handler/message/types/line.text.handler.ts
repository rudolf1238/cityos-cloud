import { TextMessage } from '@line/bot-sdk';
import { Injectable } from '@nestjs/common';
import { LineClient } from 'src/modules/line/line.client';
import { LineService } from 'src/modules/line/line.service';
import { UserService } from 'src/modules/user/user.service';

@Injectable()
export class LineTextHandler {
  constructor(
    private readonly lineClient: LineClient,
    private readonly userService: UserService,
    private readonly lineService: LineService,
  ) {}

  async handleByMessageType(
    lineUserId: string,
    text: string,
    replyToken: string,
  ) {
    let reply = '';
    switch (text) {
      case '我的ID': {
        reply = `經查詢你的LineID是: ${lineUserId || '無法取得'}`;
        break;
      }
      case '連結帳號': {
        await this.lineClient.sendBindingMessage(lineUserId);
        return;
      }
      case '設定 LINE Notify': {
        const user = await this.userService.getUserByLineID(lineUserId);
        if (user) {
          await this.lineClient.authenticationLinkByLINENotify(user);
        } else {
          await this.lineClient.sendBindingMessage(lineUserId);
        }
        return;
      }
      case '解除帳號連結': {
        const user = await this.userService.getUserByLineID(lineUserId);
        if (user) {
          await this.lineService.revokeLineNotifyToken(user);
          await this.userService.clearLineUserId(lineUserId);
          reply =
            '已解除您與CHT CityOS帳號的連結。您可以點選連結帳號重新連結CHT CityOS帳號';
        } else {
          reply = '您尚未連結LINE與CHT CityOS帳號的連結。';
        }
        break;
      }
      default: {
        return;
      }
    }

    // Compose the response message
    const response: TextMessage = {
      type: 'text',
      text: reply,
    };

    // Reply to the user which sent message in the linebot channel
    await this.lineClient.replyMessage(replyToken, response);
  }
}
