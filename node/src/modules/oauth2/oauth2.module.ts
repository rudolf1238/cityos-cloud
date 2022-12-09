import { forwardRef, Module } from '@nestjs/common';
import {
  OAuthAccessToken,
  OAuthAccessTokenSchema,
} from 'src/models/oauth.access.token';
import { OAuthClient, OAuthClientSchema } from 'src/models/oauth.client';
import { OAuthCode, OAuthCodeSchema } from 'src/models/oauth.code';
import { ConfigModule } from '@nestjs/config';
import { UserModule } from '../user/user.module';
import { AuthModule } from '../auth/auth.module';
import { Oauth2Controller } from './oauth2.controller';
import { Oauth2Service } from './oauth2.service';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: OAuthClient.name,
        schema: OAuthClientSchema,
        collection: 'oauth_clients',
      },
      {
        name: OAuthCode.name,
        schema: OAuthCodeSchema,
        collection: 'oauth_auth_codes',
      },
      {
        name: OAuthAccessToken.name,
        schema: OAuthAccessTokenSchema,
        collection: 'oauth_access_tokens',
      },
    ]),
    UserModule,
    forwardRef(() => AuthModule),
    ConfigModule,
  ],
  controllers: [Oauth2Controller],
  providers: [Oauth2Service],
  exports: [Oauth2Service],
})
export class Oauth2Module { }
