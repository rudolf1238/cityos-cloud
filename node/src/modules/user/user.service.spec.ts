import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { AuthService } from '../auth/auth.service';
import { GroupService } from '../group/group.service';
import { MailService } from '../mail/mail.service';
import { PermissionService } from '../permission/permission.service';
import { UserService } from './user.service';

const groupServiceMock: () => MockType<GroupService> = jest.fn(() => ({
  create: jest.fn(),
}));

const authServiceMock: () => MockType<AuthService> = jest.fn(() => ({
  login: jest.fn(),
  invite: jest.fn(),
}));

const permissionServiceMock: () => MockType<PermissionService> = jest.fn(
  () => ({
    create: jest.fn(),
  }),
);

const mailServiceMock: () => MockType<MailService> = jest.fn(() => ({
  sendVerificationMail: jest.fn(),
}));

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const mockUserModel = jest.fn();
    const mockVerificationCodeModel = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule],
      providers: [
        UserService,
        {
          provide: getModelToken('User'),
          useValue: mockUserModel,
        },
        {
          provide: getModelToken('VerificationCode'),
          useValue: mockVerificationCodeModel,
        },
        {
          provide: GroupService,
          useFactory: groupServiceMock,
        },
        {
          provide: AuthService,
          useFactory: authServiceMock,
        },
        {
          provide: PermissionService,
          useFactory: permissionServiceMock,
        },
        {
          provide: MailService,
          useFactory: mailServiceMock,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
