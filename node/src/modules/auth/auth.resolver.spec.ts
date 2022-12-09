import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { GoogleRecaptchaModule } from '@nestlab/google-recaptcha';
import { IncomingMessage } from 'http';
import { MockType } from 'src/app.controller.spec';
import { LogService } from '../log/log.service';
import { MailService } from '../mail/mail.service';
import { Oauth2Service } from '../oauth2/oauth2.service';
import { UserService } from '../user/user.service';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';

const userServiceMock: () => MockType<UserService> = jest.fn(() => ({
  findUser: jest.fn(),
  findUserById: jest.fn(),
}));

const jwtServiceMock: () => MockType<JwtService> = jest.fn(() => ({
  sign: jest.fn(),
  verify: jest.fn(),
}));

const oauth2ServiceMock: () => MockType<Oauth2Service> = jest.fn(() => ({
  authenticate: jest.fn(),
  accessToken: jest.fn(),
}));

const mailServiceMock: () => MockType<MailService> = jest.fn(() => ({
  sendVerificationMail: jest.fn(),
}));

const logServiceMock: () => MockType<LogService> = jest.fn(() => ({
  insertEvent: jest.fn(),
}));

describe('AuthResolver', () => {
  let resolver: AuthResolver;
  const mockOAuthAccessTokenModel = {};
  const mockDeviceTokenModel = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '../env/cityos_env',
        }),
        GoogleRecaptchaModule.forRoot({
          secretKey: '',
          response: (req: IncomingMessage) =>
            (req.headers.recaptcha || '').toString(),
        }),
      ],
      providers: [
        AuthResolver,
        AuthService,
        {
          provide: UserService,
          useFactory: userServiceMock,
        },
        {
          provide: JwtService,
          useFactory: jwtServiceMock,
        },
        {
          provide: Oauth2Service,
          useFactory: oauth2ServiceMock,
        },
        {
          provide: MailService,
          useFactory: mailServiceMock,
        },
        {
          provide: LogService,
          useFactory: logServiceMock,
        },
        {
          provide: getModelToken('OAuthAccessToken'),
          useValue: mockOAuthAccessTokenModel,
        },
        {
          provide: getModelToken('DeviceToken'),
          useValue: mockDeviceTokenModel,
        },
      ],
    }).compile();

    resolver = module.get<AuthResolver>(AuthResolver);
  });

  afterAll(async () => {
    await resolver.close();
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
