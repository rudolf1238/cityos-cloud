import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ApolloError } from 'apollo-server-express';
import {
  LoginPayload,
  LoginInput,
  RefreshTokenPayload,
  ListenVerifyStatusChangedPayload,
  UserStatus,
} from 'src/graphql.schema';
import { ErrorCode } from 'src/models/error.code';
import {
  OAuthAccessToken,
  OAuthAccessTokenDocument,
} from 'src/models/oauth.access.token';
import { User } from 'src/models/user';
import { compare } from 'bcrypt';
import OAuth2Server from 'oauth2-server';
import { ConfigService } from '@nestjs/config';
import { EmailType } from 'src/models/email.type';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import { Constants } from 'src/constants';
import { DateTime } from 'luxon';
import { DeviceToken, DeviceTokenDocument } from 'src/models/device.token';
import { randomBytes } from 'crypto';
import StringUtils from 'src/utils/StringUtils';
import { MailService } from '../mail/mail.service';
import { Oauth2Service } from '../oauth2/oauth2.service';
import { UserService } from '../user/user.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(DeviceToken.name)
    private readonly deviceTokenModel: Model<DeviceTokenDocument>,
    @InjectModel(OAuthAccessToken.name)
    private readonly tokenModel: Model<OAuthAccessTokenDocument>,
    @Inject(forwardRef(() => UserService))
    private userService: UserService,
    @Inject(forwardRef(() => Oauth2Service))
    private oauth2Service: Oauth2Service,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  async login(loginInput: LoginInput): Promise<LoginPayload> {
    const user = await this.userService.findUser(loginInput.email);

    if (user === null || user.password === undefined) {
      throw new ApolloError(
        'The user does not exist.',
        ErrorCode.AUTH_USER_NOT_FOUND,
      );
    }

    const enableLogin = await this.enableLogin(user);
    if (!enableLogin) {
      await this.loginFailed(user);
      throw new ApolloError(
        'Sorry you have to wait 30 minutes to log in again.',
        ErrorCode.AUTH_EXCEED_RETRY_PASSWORD_MAXIMUM,
      );
    }

    const body = {
      client_id: this.configService.get<string>('OFFICIAL_CLIENT_ID'),
      client_secret: this.configService.get<string>('OFFICIAL_CLIENT_SECRET'),
      grant_type: 'password',
      username: loginInput.email,
      password: loginInput.password,
    };
    const params = {
      body,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': JSON.stringify(body).length,
      },
      method: 'POST',
      query: {},
    };

    const request = new OAuth2Server.Request(params);
    const response = new OAuth2Server.Response();

    const token = await this.oauth2Service
      .getToken(request, response)
      .catch(async (error) => {
        await this.loginFailed(user);
        throw new UnauthorizedException(error);
      });

    // login successfully
    await this.userService.updateAttempts(user._id.toHexString(), null, null);

    const payload = new LoginPayload();
    payload.refreshToken = token.refreshToken;
    payload.refreshTokenExpiresAt = token.refreshTokenExpiresAt;

    return payload;
  }

  async refreshToken(
    refreshToken: string,
    deviceToken: string,
  ): Promise<RefreshTokenPayload> {
    const tokenForModel = await this.tokenModel.findOne({
      refreshToken,
    });

    this.logger.log(
      `${tokenForModel?.user?.email} try to refreshToken. (deviceToken, refreshToken) = (${deviceToken}, ${refreshToken})`,
    );

    // verify the deviceToken
    const deviceTokenFromModel = await this.deviceTokenModel.findOne({
      user: tokenForModel?.user._id,
      deviceToken,
    });

    if (!deviceTokenFromModel) {
      throw new ApolloError(
        'The refreshToken or deviceToken you provided is invalid. Please try again later.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }

    const body = {
      client_id: this.configService.get<string>('OFFICIAL_CLIENT_ID'),
      client_secret: this.configService.get<string>('OFFICIAL_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    };
    const params = {
      body,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': JSON.stringify(body).length,
      },
      method: 'POST',
      query: {},
    };

    const request = new OAuth2Server.Request(params);
    const response = new OAuth2Server.Response();

    const token = await this.oauth2Service
      .getToken(request, response)
      .catch(async (error) => {
        await this.oauth2Service.revokeToken(
          tokenForModel.user,
          tokenForModel.refreshToken,
        );
        throw new UnauthorizedException(error);
      });

    const payload = new RefreshTokenPayload();
    payload.accessToken = token.accessToken;
    payload.accessTokenExpiresAt = token.accessTokenExpiresAt;
    payload.refreshToken = token.refreshToken;
    payload.refreshTokenExpiresAt = token.refreshTokenExpiresAt;

    return payload;
  }

  async deviceBinding(refreshToken: string): Promise<boolean> {
    // Check the refreshToken is valid for this user
    const user = await this.getUserByRefreshToken(refreshToken);

    if (user == null) {
      throw new ApolloError(
        'The token you provided is invalid.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }

    // Create the VerificationCode and send the confirmation email
    const vCode = await this.userService.getVerificationCode(
      user,
      EmailType.DEVICE_BINDING,
    );
    return this.mailService.sendVerificationMail(
      user,
      EmailType.DEVICE_BINDING,
      null,
      vCode,
    );
  }

  async verifyAccessCode(
    pubSub: RedisPubSub,
    accessCode: string,
  ): Promise<boolean> {
    const vCode = await this.userService.isValidAccessCode(
      accessCode,
      EmailType.DEVICE_BINDING,
    );

    // check the user status ACTIVE (otherwise WAITING user can call this API by an accessCode sending by 'invite user')
    if (vCode?.user.status !== UserStatus.ACTIVE) {
      return false;
    }

    // publish the deviceToken to the subscriber
    if (vCode !== null) {
      const payload = new ListenVerifyStatusChangedPayload();
      // generate the new device token
      payload.deviceToken = await this.createDeviceToken(vCode?.user);
      await pubSub.publish(
        `${
          Constants.PREFIX_FOR_VERIFY_STATUS_TOPIC
        }${vCode.user._id.toHexString()}`,
        { listenVerifyStatusChanged: payload },
      );
    }

    return !!vCode;
  }

  async changePassword(
    user: User,
    oldPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    if (!StringUtils.isValidPassword(newPassword)) {
      throw new ApolloError(
        'Please check the length of your new password.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }

    const verified = await this.validatePassword(oldPassword, user.password);
    if (verified) {
      return this.userService.updatePassword(user, newPassword);
    }
    throw new UnauthorizedException();
  }

  async forgotPassword(email: string): Promise<boolean> {
    const user = await this.userService.findUser(email);
    if (user === null || user.status !== UserStatus.ACTIVE) {
      return true;
    }

    // Create the VerificationCode and send the forgot password email
    const vCode = await this.userService.getVerificationCode(
      user,
      EmailType.FORGOT_PASSWORD,
    );
    await this.mailService.sendVerificationMail(
      user,
      EmailType.FORGOT_PASSWORD,
      null,
      vCode,
    );

    // always return true to avoid someone guesses the existence of the email
    return true;
  }

  async resetPassword(
    accessCode: string,
    newPassword: string,
  ): Promise<boolean> {
    if (!StringUtils.isValidPassword(newPassword)) {
      throw new ApolloError(
        'Please check the length of your new password.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }

    const vCode = await this.userService.isValidAccessCode(
      accessCode,
      EmailType.FORGOT_PASSWORD,
    );
    if (vCode != null) {
      // update user password
      await this.userService.updatePassword(vCode.user, newPassword);
      // remove this verificationCode
      return this.userService.deleteVerificationCode(vCode);
    }
    return false;
  }

  async logout(user: User, refreshToken: string): Promise<boolean> {
    this.logger.log(
      `${user.email} try to logout. refreshToken = ${refreshToken}`,
    );
    return !!(await this.oauth2Service.revokeToken(user, refreshToken));
  }

  async validatePassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return compare(password, hashedPassword); // plainText, hashedText
  }

  async getAccessToken(accessToken: string): Promise<OAuthAccessToken> {
    return this.tokenModel.findOne({ accessToken });
  }

  async getUserByRefreshToken(refreshToken: string): Promise<User> {
    const token = await this.tokenModel.findOne({ refreshToken });
    return token?.user;
  }

  async createDeviceToken(user: User): Promise<string> {
    const deviceToken = new DeviceToken();
    deviceToken.user = user;
    deviceToken.deviceToken = randomBytes(32).toString('hex');
    const token = await this.deviceTokenModel.create(deviceToken);
    return token.deviceToken;
  }

  private async enableLogin(user: User): Promise<boolean> {
    if (user.attempts !== undefined) {
      const current = DateTime.now();
      const before = DateTime.fromJSDate(user.attemptFailedFrom);
      if (
        before.plus({
          minutes: Constants.MAXIMUM_RETRY_PASSWORD_SESSION_IN_MINUTES,
        }) < current
      ) {
        // retry password wait more than 30 minutes
        user.clearAttempts();
        return true;
      }
      return user.attempts < Constants.MAXIMUM_RETRY_PASSWORD;
    }
    return true;
  }

  private async loginFailed(user: User) {
    let { attemptFailedFrom } = user;
    let { attempts } = user;
    this.logger.log(
      `loginFailed: (attemptFailedFrom, attempts) = (${attemptFailedFrom?.toUTCString()}, ${attempts})`,
    );

    attemptFailedFrom = new Date();
    attempts = attempts ? attempts + 1 : 1;

    await this.userService.updateAttempts(
      user._id.toHexString(),
      attemptFailedFrom,
      attempts,
    );
  }
}
