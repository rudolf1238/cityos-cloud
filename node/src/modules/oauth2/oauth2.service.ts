/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OAuthAccessToken,
  OAuthAccessTokenDocument,
} from 'src/models/oauth.access.token';
import { OAuthClient, OAuthClientDocument } from 'src/models/oauth.client';
import { OAuthCode, OAuthCodeDocument } from 'src/models/oauth.code';
import OAuth2Server from 'oauth2-server';
import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/models/user';
import { UserService } from '../user/user.service';
import { AuthService } from '../auth/auth.service';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class Oauth2Service {
  private oauthServer: OAuth2Server;

  constructor(
    @InjectModel(OAuthClient.name)
    private readonly oauthClientModel: Model<OAuthClientDocument>,
    @InjectModel(OAuthCode.name)
    private readonly oauthCodeModel: Model<OAuthCodeDocument>,
    @InjectModel(OAuthAccessToken.name)
    private readonly oauthAccessTokenModel: Model<OAuthAccessTokenDocument>,
    private readonly userService: UserService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    const oauth2Model:
      | OAuth2Server.AuthorizationCodeModel
      | OAuth2Server.PasswordModel
      | OAuth2Server.RefreshTokenModel = {
      getAccessToken: async (accessToken: string) => {
        return oauthAccessTokenModel.findOne({ accessToken });
      },
      getAuthorizationCode: async (code) => {
        return oauthCodeModel.findOne({ authorizationCode: code });
      },
      getClient: async (id, secret) => {
        let params = {};
        params = { ...params, clientId: id };
        if (secret) {
          params = { ...params, clientSecret: secret };
        }
        return oauthClientModel.findOne(params);
      },
      saveToken: async (token, client, user) => {
        const oAuthAccessToken = new OAuthAccessToken();
        oAuthAccessToken.user = user._id;
        oAuthAccessToken.client = client._id;
        oAuthAccessToken.accessToken = token.accessToken;
        oAuthAccessToken.accessTokenExpiresAt = token.accessTokenExpiresAt;
        oAuthAccessToken.refreshToken = token.refreshToken;
        oAuthAccessToken.refreshTokenExpiresAt = token.refreshTokenExpiresAt;
        oAuthAccessToken.scope = token.scope;

        return oauthAccessTokenModel.create(oAuthAccessToken);
      },
      saveAuthorizationCode: async (code, client, user) => {
        const authCode = new OAuthCode();
        authCode.user = user._id;
        authCode.client = client._id;
        authCode.authorizationCode = code.authorizationCode;
        authCode.expiresAt = code.expiresAt;
        authCode.scope = code.scope;

        return oauthCodeModel.create(authCode);
      },
      revokeAuthorizationCode: async (code) => {
        const result = await oauthCodeModel.deleteOne({
          authorizationCode: code.authorizationCode,
        });
        return result.deletedCount > 0;
      },
      verifyScope: async (_token, _scope) => {
        return true;
      },
      generateAccessToken: async (_client, _user, _scope) => {
        return randomBytes(64).toString('base64');
      },
      generateRefreshToken: async (_client, _user, _scope) => {
        return randomBytes(64).toString('base64');
      },
      getUser: async (email, password) => {
        const user = await this.userService.findUser(email);
        if (user === null) {
          throw new UnauthorizedException();
        }

        const verified = await this.authService.validatePassword(
          password,
          user.password,
        );
        if (!verified) {
          throw new UnauthorizedException();
        }
        return user;
      },
      getRefreshToken: async (refreshToken) => {
        return oauthAccessTokenModel.findOne({ refreshToken });
      },
      revokeToken: async (token) => {
        const result = await oauthAccessTokenModel.deleteOne({
          accessToken: token.accessToken,
        });
        return result.deletedCount > 0;
      },
    };
    this.oauthServer = new OAuth2Server({
      model: oauth2Model,
      accessTokenLifetime: this.configService.get<number>(
        'ACCESS_TOKEN_EXPIRED_IN_SECONDS',
      ),
      refreshTokenLifetime: this.configService.get<number>(
        'REFRESH_TOKEN_EXPIRED_IN_SECONDS',
      ),
      allowEmptyState: false,
    });
  }

  private readonly logger = new Logger(Oauth2Service.name);

  async onModuleInit() {
    // check the existence of the root group and try to init it
    const client = await this.initialize();
    if (client) {
      // continue to init the root user if users in database are empty
      this.logger.log(
        `There is no official Oauth2 client in the CityOS, and create it automatically: ${client}`,
      );
    }
  }

  async authenticate(req: ExpressRequest, res: ExpressResponse) {
    const request = new OAuth2Server.Request(req);
    const response = new OAuth2Server.Response(res);

    request.body.user = await this.userService.findUser(
      request.body.email as string,
    );

    this.oauthServer
      .authorize(request, response, {
        authenticateHandler: {
          handle: (request) => {
            return request.body.user;
          },
        },
      })
      .then((success: OAuth2Server.AuthorizationCode) => {
        res.redirect(
          `${req.query.redirect_uri}?code=${success.authorizationCode}&state=${req.query.state}`,
        );
      })
      .catch((err: any) => {
        res.status((err.code as number) || 500).json(err);
      });
  }

  async accessToken(req: ExpressRequest, res: ExpressResponse) {
    const request = new OAuth2Server.Request(req);
    const response = new OAuth2Server.Response(res);
    await this.getToken(request, response, (error?, token?) => {
      if (error) {
        res.status((error.code as number) || 500).json(error);
      } else {
        res.json(token);
      }
    });
  }

  async getToken(
    req: OAuth2Server.Request,
    res: OAuth2Server.Response,
    callback?: (err?: any, token?: any) => void,
  ) {
    return this.oauthServer.token(req, res, null, callback);
  }

  async revokeToken(
    user: User,
    refreshToken: string,
  ): Promise<OAuthAccessToken> {
    return this.oauthAccessTokenModel.findOneAndDelete({
      user,
      refreshToken,
    });
  }

  private async initialize(): Promise<OAuthClient> {
    const clients = await this.oauthClientModel.find();
    if (clients.length > 0) {
      return null;
    }
    const client = new OAuthClient();
    client.clientId = this.configService.get<string>('OFFICIAL_CLIENT_ID');
    client.clientSecret = this.configService.get<string>(
      'OFFICIAL_CLIENT_SECRET',
    );
    client.redirectUris = [
      this.configService.get<string>('OFFICIAL_REDIRECT_URI'),
    ];
    client.grants = ['authorization_code', 'refresh_token', 'password'];
    return this.oauthClientModel.create(client);
  }
}
