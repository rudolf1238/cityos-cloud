import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nModule } from 'nestjs-i18n';
import path from 'path';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule,
        I18nModule.forRoot({
          fallbackLanguage: 'en-US',
          loaderOptions: {
            path: path.join(__dirname, '../../locales/'),
            watch: true,
          },
        }),
        /* MailerModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => ({
            transport: {
              host: configService.get<string>('SMTP_MAIL_SERVER_HOST'),
              port: configService.get<number>('SMTP_MAIL_SERVER_PORT'),
              secure: false,
              auth: {
                user: configService.get<string>('SMTP_MAIL_SERVER_USERNAME'),
                pass: configService.get<string>('SMTP_MAIL_SERVER_PASSWORD'),
              },
            },
            defaults: {
              from: configService.get<string>('SMTP_MAIL_SERVER_DEFALUT_FROM'),
            },
            template: {
              dir: join(__dirname, '../../views'),
              adapter: new HandlebarsAdapter(),
              options: {
                strict: true,
              },
            },
          }),
          inject: [ConfigService],
        }), */
      ],
      providers: [MailService],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
