import { ConfigService } from '@nestjs/config';
import { Args, Mutation, Resolver, Subscription } from '@nestjs/graphql';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import {
  LoginPayload,
  LoginInput,
  RefreshTokenPayload,
  ListenVerifyStatusChangedPayload,
  ChangePasswordInput,
  ResetPasswordInput,
} from 'src/graphql.schema';
import Redis from 'ioredis';
import { Constants } from 'src/constants';
import { User } from 'src/models/user';
import { Recaptcha } from '@nestlab/google-recaptcha';
import { Log, UserEvent } from 'src/models/log';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './auth.decorator';
import { LogService } from '../log/log.service';

@Resolver('Auth')
export class AuthResolver {
  private pubSub: RedisPubSub;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private logService: LogService,
  ) {
    const options = {
      retryStrategy: (times: number) => {
        // reconnect after
        return Math.min(times * 50, 2000);
      },
    };

    this.pubSub = new RedisPubSub({
      publisher: new Redis(
        this.configService.get<string>('REDIS_URI'),
        options,
      ),
      subscriber: new Redis(
        this.configService.get<string>('REDIS_URI'),
        options,
      ),
    });
  }

  @Recaptcha()
  @Public()
  @Mutation()
  login(@Args('loginInput') loginInput: LoginInput): Promise<LoginPayload> {
    return this.authService.login(loginInput);
  }

  @Public()
  @Mutation()
  async refreshToken(
    @Args('refreshToken') refreshToken: string,
    @Args('deviceToken') deviceToken: string,
  ): Promise<RefreshTokenPayload> {
    // log
    const log = new Log(
      null,
      UserEvent.REFRESH_TOKEN,
      '',
      [deviceToken, refreshToken],
      deviceToken,
    );
    await this.logService.insertEvent(log);

    return this.authService.refreshToken(refreshToken, deviceToken);
  }

  @Public()
  @Mutation()
  async deviceBinding(
    @Args('refreshToken') refreshToken: string,
  ): Promise<boolean> {
    return this.authService.deviceBinding(refreshToken);
  }

  @Public()
  @Mutation()
  async verifyAccessCode(
    @Args('accessCode') accessCode: string,
  ): Promise<boolean> {
    return this.authService.verifyAccessCode(this.pubSub, accessCode);
  }

  @Mutation()
  async changePassword(
    @CurrentUser() user: User,
    @Args('changePasswordInput') changePasswordInput: ChangePasswordInput,
  ): Promise<boolean> {
    return this.authService.changePassword(
      user,
      changePasswordInput.oldPassword,
      changePasswordInput.newPassword,
    );
  }

  @Recaptcha()
  @Public()
  @Mutation()
  async forgotPassword(@Args('email') email: string): Promise<boolean> {
    return this.authService.forgotPassword(email);
  }

  @Public()
  @Mutation()
  async resetPassword(
    @Args('resetPasswordInput') resetPasswordInput: ResetPasswordInput,
  ): Promise<boolean> {
    return this.authService.resetPassword(
      resetPasswordInput.accessCode,
      resetPasswordInput.password,
    );
  }

  @Public()
  @Subscription(() => ListenVerifyStatusChangedPayload)
  async listenVerifyStatusChanged(@Args('refreshToken') refreshToken: string) {
    const user = await this.authService.getUserByRefreshToken(refreshToken);
    const topic = `${
      Constants.PREFIX_FOR_VERIFY_STATUS_TOPIC
    }${user?._id.toHexString()}`;
    return this.pubSub.asyncIterator(topic);
  }

  @Mutation()
  async logout(
    @CurrentUser() user: User,
    @Args('refreshToken') refreshToken: string,
  ): Promise<boolean> {
    // log
    const log = new Log(
      user,
      UserEvent.LOG_OUT,
      '',
      [refreshToken],
      refreshToken,
    );
    await this.logService.insertEvent(log);

    return this.authService.logout(user, refreshToken);
  }

  async close() {
    await this.pubSub.close();
  }
}
