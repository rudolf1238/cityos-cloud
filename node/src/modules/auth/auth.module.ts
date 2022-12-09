import { forwardRef, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  OAuthAccessToken,
  OAuthAccessTokenSchema,
} from 'src/models/oauth.access.token';
import {
  ApplicationType,
  GoogleRecaptchaModule,
  GoogleRecaptchaNetwork,
} from '@nestlab/google-recaptcha';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IncomingMessage } from 'http';
import { DeviceToken, DeviceTokenSchema } from 'src/models/device.token';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';
import { UserModule } from '../user/user.module';
import { HttpStrategy } from './http.strategy';
import { HttpAuthGuard } from './http-auth.guard';
import { Oauth2Module } from '../oauth2/oauth2.module';
import { MailModule } from '../mail/mail.module';
import { LogModule } from '../log/log.module';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    forwardRef(() => UserModule),
    MongooseModule.forFeature([
      {
        name: OAuthAccessToken.name,
        schema: OAuthAccessTokenSchema,
        collection: 'oauth_access_tokens',
      },
      {
        name: DeviceToken.name,
        schema: DeviceTokenSchema,
        collection: 'device_tokens',
      },
    ]),
    forwardRef(() => Oauth2Module),
    MailModule,
    GoogleRecaptchaModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secretKey: configService.get<string>('GOOGLE_RECAPTCHA_SECRET_KEY'),
        response: (req: IncomingMessage) =>
          (req.headers.recaptcha || '').toString(),
        skipIf: process.env.NODE_ENV === 'local',
        network: GoogleRecaptchaNetwork.Google,
        applicationType: ApplicationType.GraphQL,
        agent: null,
      }),
      inject: [ConfigService],
    }),
    LogModule,
  ],
  providers: [
    AuthResolver,
    AuthService,
    // using HttpAuthGuard globally
    {
      provide: APP_GUARD,
      useClass: HttpAuthGuard,
    },
    HttpStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
