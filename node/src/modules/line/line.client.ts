import { Client, Message } from '@line/bot-sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosResponse } from 'axios';
import FormData from 'form-data';
import { User } from 'src/models/user';
import { UserService } from '../user/user.service';

@Injectable()
export class LineClient {
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    const config = {
      channelAccessToken: this.configService.get<string>(
        'LINE_CHANNEL_ACCESS_TOKEN',
      ),
      channelSecret: this.configService.get<string>('LINE_CHANNEL_SECRET'),
    };
    this.client = new Client(config);
  }

  private client: Client;

  private readonly logger = new Logger(LineClient.name);

  async replyMessage(replyToken: string, messages: Message | Message[]) {
    await this.client.replyMessage(replyToken, messages);
  }

  async pushMessage(lineUserId: string, text: string) {
    await this.client.pushMessage(lineUserId, {
      type: 'text',
      text,
    });
  }

  async sendBindingMessage(lineUserId: string) {
    const user = await this.userService.getUserByLineID(lineUserId);

    if (user) {
      if (user.lineNotifyToken) {
        await this.client.pushMessage(lineUserId, {
          type: 'text',
          text: `您的CHT CityOS帳號 : ${user.name}(${user.email}) 已與此Line帳號連結成功！`,
        });
      } else {
        await this.authenticationLinkByLINENotify(user);
      }
    } else {
      const token = await this.client.getLinkToken(lineUserId);
      const bindURI = this.configService.get<string>(
        'LINE_ACCOUNT_LINK_BIND_URI',
      );
      const profile = await this.client.getProfile(lineUserId);
      await this.client.pushMessage(lineUserId, {
        type: 'template',
        altText: `Hi ${profile.displayName}\n(步驟1/2) 歡迎加入CHT CityOS官方帳號\n輕鬆點選連結您的帳號`,
        template: {
          type: 'buttons',
          text: `Hi ${profile.displayName}\n(步驟1/2) 歡迎加入CHT CityOS官方帳號\n輕鬆點選連結您的帳號`,
          actions: [
            {
              type: 'uri',
              label: '連結帳號',
              uri: `${bindURI}${token}`,
            },
          ],
        },
      });
    }
  }

  async authenticationLinkByLINENotify(user: User) {
    const clientId = this.configService.get<string>('LINE_NOTIFY_CLIENT_ID');
    const redirectUri = this.configService.get<string>(
      'LINE_NOTIFY_REDIRECT_URI',
    );
    const bindingURL = `https://notify-bot.line.me/oauth/authorize?response_type=code&scope=notify&state=${user.id}&client_id=${clientId}&redirect_uri=${redirectUri}`;

    await this.client.pushMessage(user.lineUserId, {
      type: 'template',
      altText: `Hi ${user.name}\n(步驟2/2) 下一步您需要設定Line Notify來發送與您相關的裝置通知。同意並連動1對1接收LINE Notify的通知功能！`,
      template: {
        type: 'buttons',
        text: `Hi ${user.name}\n(步驟2/2) 下一步您需要設定Line Notify來發送與您相關的裝置通知。同意並連動1對1接收LINE Notify的通知功能！`,
        actions: [
          {
            type: 'uri',
            label: '設定Line Notify',
            uri: bindingURL,
          },
        ],
      },
    });
  }

  async sendMessageByNotify(
    user: User,
    message: string,
    base64Images: string[],
  ) {
    interface LINENotifyReponse {
      status: number;
      message: string;
    }

    let i = 0;
    do {
      const formData = new FormData();

      if (base64Images.length === 0) {
        formData.append('message', message);
      } else {
        formData.append(
          'imageFile',
          Buffer.from(base64Images[i], 'base64'),
          'imageFile.jpg',
        );
        if (i === 0) {
          formData.append('message', message);
        } else {
          formData.append('message', ' ');
        }
      }

      const headers = Object.assign(
        {
          Authorization: `Bearer ${user.lineNotifyToken}`,
        },
        formData.getHeaders(),
      );

      await axios
        .post('https://notify-api.line.me/api/notify', formData, {
          headers,
        })
        .then((res: AxiosResponse<LINENotifyReponse>) => res.data)
        .catch((error: AxiosError<LINENotifyReponse>) => {
          this.logger.error(
            `sendMessageByNotify error: ${JSON.stringify(
              error.response.data.message,
            )}`,
          );
        });
      i++;
    } while (i < base64Images.length);
  }
}
