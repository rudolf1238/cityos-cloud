import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  imports: [
    // https://github.com/nest-modules/mailer/issues/691
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
  exports: [MailService],
})
export class MailModule {}
