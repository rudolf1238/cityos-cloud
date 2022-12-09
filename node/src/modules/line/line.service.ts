import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ApolloError } from 'apollo-server-express';
import { LineBindingPayload } from 'src/graphql.schema';
import { ErrorCode } from 'src/models/error.code';
import { AuthService } from '../auth/auth.service';
import { UserService } from '../user/user.service';
import { randomBytes } from 'crypto';
import axios, { AxiosError, AxiosResponse } from 'axios';
import StringUtils from 'src/utils/StringUtils';
import { ConfigService } from '@nestjs/config';
import { LineClient } from './line.client';
import { User } from 'src/models/user';

@Injectable()
export class LineService {
  constructor(
    private readonly authService: AuthService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly lineClient: LineClient,
  ) {}

  private readonly logger = new Logger(LineService.name);

  async lineBinding(
    email: string,
    password: string,
  ): Promise<LineBindingPayload> {
    const user = await this.userService.findUser(email);

    if (!user) {
      throw new ApolloError(
        `The credential you enter is not correct, and please try again.`,
        ErrorCode.AUTH_INVALID_PASSWORD,
      );
    }

    const verified = await this.authService.validatePassword(
      password,
      user.password,
    );

    if (!verified) {
      throw new ApolloError(
        `The credential you enter is not correct, and please try again.`,
        ErrorCode.AUTH_INVALID_PASSWORD,
      );
    }

    const nonce = randomBytes(16).toString('base64');
    await this.userService.updateLineNonce(user, nonce);

    const payload = new LineBindingPayload();
    payload.nonce = nonce;
    return payload;
  }

  async lineNotifyBinding(code: string, state: string): Promise<boolean> {
    let user: User = null;
    try {
      user = await this.userService.findUserById(state);
      // revoke the previous token
      await this.revokeLineNotifyToken(user);
    } catch (e) {
      this.logger.warn(e);
      return false;
    }

    // get token
    interface LINENotifyReponse {
      status: number;
      message: string;
      access_token: string;
    }

    const params = {
      grant_type: 'authorization_code',
      redirect_uri: this.configService.get<string>('LINE_NOTIFY_REDIRECT_URI'),
      client_id: this.configService.get<string>('LINE_NOTIFY_CLIENT_ID'),
      client_secret: this.configService.get<string>(
        'LINE_NOTIFY_CLIENT_SECRET',
      ),
      code,
    };

    const response = await axios
      .post(
        'https://notify-bot.line.me/oauth/token',
        StringUtils.encodeQueryParameters(params),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      )
      .then((res: AxiosResponse<LINENotifyReponse>) => res.data)
      .catch((error: AxiosError<LINENotifyReponse>) => {
        this.logger.error(
          `lineNotifyBinding get token failed by ${error.response.data.message}`,
        );
        return error.response.data;
      });

    // save the access_token by state
    if (response.status === 200) {
      this.logger.debug(`Get the ${response.access_token} for ${state}`);
      await this.userService.updateLineNotifyToken(
        state,
        response.access_token,
      );
      await this.lineClient.pushMessage(
        user.lineUserId,
        '綁定成功! 您現在可以設定與接收從CHT CityOS傳送過來的提示通知了!',
      );
      return true;
    } else {
      return false;
    }
  }

  async revokeLineNotifyToken(user: User): Promise<boolean> {
    if (user?.lineNotifyToken) {
      interface RevokeLINENotifyReponse {
        status: number;
        message: string;
      }

      const response = await axios
        .post('https://notify-api.line.me/api/revoke', null, {
          headers: {
            Authorization: `Bearer ${user?.lineNotifyToken}`,
            'Content-Type': 'application/json',
          },
        })
        .then((res: AxiosResponse<RevokeLINENotifyReponse>) => res.data)
        .catch((res: AxiosResponse<RevokeLINENotifyReponse>) => {
          this.logger.error(
            `revokeLineNotifyToken error: ${JSON.stringify(res)}`,
          );
          return {
            status: res.status,
            message: '',
          };
        });

      return response.status === 200;
    } else {
      return true;
    }
  }
}
