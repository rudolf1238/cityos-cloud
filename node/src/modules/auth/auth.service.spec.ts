/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { UnauthorizedException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { GoogleRecaptchaModule } from '@nestlab/google-recaptcha';
import { hashSync } from 'bcrypt';
import { IncomingMessage } from 'http';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { User } from 'src/models/user';
import { MailService } from '../mail/mail.service';
import { Oauth2Service } from '../oauth2/oauth2.service';
import { UserService } from '../user/user.service';
import { AuthService } from './auth.service';

const users = {
  '1': {
    name: 'test',
    password: hashSync('correctPassword', 10),
  },
};

const userServiceMock: () => MockType<UserService> = jest.fn(() => ({
  findUser: jest.fn(),
  findUserById: jest.fn((id) => {
    return users[id];
  }),
  updatePassword: jest.fn((user, newPassword) => {
    user.password = hashSync(newPassword, 10);
    return true;
  }),
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

describe('AuthService', () => {
  let service: AuthService;
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
          provide: getModelToken('OAuthAccessToken'),
          useValue: mockOAuthAccessTokenModel,
        },
        {
          provide: getModelToken('DeviceToken'),
          useValue: mockDeviceTokenModel,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', async () => {
    expect(service).toBeDefined();
    // wrong old password
    await expect(
      service.changePassword(users['1'] as User, 'wrongPassword', '11111111'),
    ).rejects.toEqual(new UnauthorizedException());

    // correct old password
    const result = await service.changePassword(
      users['1'] as User,
      'correctPassword',
      '11111111',
    );
    expect(result).toEqual(true);

    // make sure update successfully
    const verified = await service.validatePassword(
      '11111111',
      users['1'].password,
    );
    expect(verified).toEqual(true);
  });
});
