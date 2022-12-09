import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mjml2html from 'mjml';
import { EmailType } from 'src/models/email.type';
import { User } from 'src/models/user';
import { ContactUsInput, Language } from 'src/graphql.schema';
import { VerificationCode } from 'src/models/verification.code';
import StringUtils from 'src/utils/StringUtils';
import nodemailer, { SendMailOptions } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { I18nService } from 'nestjs-i18n';
import axios from 'axios';
import * as https from 'https';

interface MailContent {
  subject: string;
  message?: string;
  action?: string;
  link?: string;
  extra?: string;
  signature?: string;
  footer?: string;
  base64Images?: string[];
}

@Injectable()
export class MailService {
  constructor(
    // private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    private readonly i18nService: I18nService,
  ) {}

  private mailTransport = nodemailer.createTransport({
    host: this.configService.get<string>('SMTP_MAIL_SERVER_HOST'),
    port: this.configService.get<number>('SMTP_MAIL_SERVER_PORT'),
    secure: false,
    auth: {
      user: this.configService.get<string>('SMTP_MAIL_SERVER_USERNAME'),
      pass: this.configService.get<string>('SMTP_MAIL_SERVER_PASSWORD'),
    },
  });

  private readonly logger = new Logger(MailService.name);

  // There are 3 types of verification mail
  // 1. Accept Invitation
  //    1.1. Proceed to Create Account (type=register)
  //    1.2. Tell old user get invited only (type, code = null)
  // 2. Confirm Login (type=binding)
  // 3. Reset Password (type=reset)
  async sendVerificationMail(
    user: User,
    type: EmailType,
    inviter?: User,
    vCode?: VerificationCode,
  ): Promise<boolean> {
    this.logger.log(
      `Send mail(${type}) from ${inviter?.email} to ${user.email}. code = ${vCode?.code}`,
    );

    let validationUrl = '';
    const inviterName = inviter?.name || inviter?.email;
    const language = inviter?.language || user.language;

    if (vCode) {
      const accessCode = this.getAccessCode(user, vCode.code);
      const encodedMail = encodeURIComponent(user.email);
      validationUrl = `${this.configService.get<string>(
        'CITYOS_WEB_URI',
      )}/verify/?type=${type.toString()}&accessCode=${accessCode}&email=${encodedMail}&expired=${Math.floor(
        vCode.expiresAt.getTime() / 1000,
      )}&lang=${language}`;
    } else {
      validationUrl = `${this.configService.get<string>('CITYOS_WEB_URI')}/map`;
    }

    // 印出要用於驗證的 URL
    if (this.configService.get<number>('SHOW_VERIFICATION_URL')) {
      this.logger.log(`Validation URL = ${validationUrl}`);
    }

    if (
      this.configService.get<number>('DISABLED_EMAIL_VERIFICATION', 0) &&
      type === EmailType.DEVICE_BINDING
    ) {
      try {
        // 直接戳 GraphQL
        await axios.post(
          `${this.configService.get<string>(
            'CITYOS_WEB_URI',
          )}${this.configService.get<string>('CITYOS_API_PATH')}`,
          {
            operationName: 'verifyAccessCode',
            variables: {
              accessCode: this.getAccessCode(user, vCode.code),
            },
            query:
              'mutation verifyAccessCode($accessCode: String!) {\n  verifyAccessCode(accessCode: $accessCode)\n}\n',
          },
          {
            httpsAgent: new https.Agent({
              rejectUnauthorized: false, // 忽略不合法的 SSL 憑證
            }),
          },
        );
        return true;
      } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
          this.logger.error(
            `Automatically verify email error = ${JSON.stringify(
              error.response?.data,
            )}`,
          );
        }
        return false;
      }
    } else {
      // 乖乖寄驗證信
      return !!(await this.sendMail(
        user.email,
        this.createSendMailOptions(language, type, validationUrl, inviterName),
      ));
    }
  }

  async sendContactUsMail(contactUsInput: ContactUsInput): Promise<boolean> {
    return !!(await this.sendMail(
      this.configService.get<string>('MAIL_RECEIVER_FOR_CUSTOMER_SUPPORT'),
      this.createSendContactUsMailOptions(
        contactUsInput.name,
        contactUsInput.message,
        contactUsInput.email,
        contactUsInput.organization,
        contactUsInput.phone,
      ),
    ));
  }

  async sendAutomationNotifyMail(
    user: User,
    message: string,
    link: string,
    base64Images: string[],
  ): Promise<boolean> {
    return !!(await this.sendMail(
      user.email,
      await this.createSendAutomationNotidyMailOptions(
        user.language,
        message,
        link,
        base64Images,
      ),
    ));
  }

  private getAccessCode(user: User, code: string): string {
    const data = `${user._id.toHexString()}.${code}`;
    return Buffer.from(data, 'binary').toString('base64');
  }

  private renderMail({
    subject,
    message = '',
    action = '',
    link = '',
    extra = '',
    signature = '',
    footer = '',
    base64Images = [],
  }: MailContent): SendMailOptions {
    const result = mjml2html({
      tagName: 'mjml',
      attributes: {},
      children: [
        {
          tagName: 'mj-head',
          attributes: {},
          children: [
            {
              tagName: 'mj-attributes',
              attributes: {},
              children: [
                {
                  tagName: 'mj-all',
                  attributes: {
                    'font-family': 'Roboto, Arial, Helvetica, sans-serif',
                  },
                },
              ],
            },
          ],
        },
        {
          tagName: 'mj-body',
          attributes: {},
          children: [
            {
              tagName: 'mj-wrapper',
              attributes: {},
              children: [
                {
                  tagName: 'mj-section',
                  attributes: {
                    padding: '0 0 48px',
                  },
                  children: [
                    {
                      tagName: 'mj-column',
                      attributes: {
                        padding: '0',
                      },
                      children: [
                        {
                          tagName: 'mj-image',
                          attributes: {
                            padding: '0',
                            width: '600px',
                            src: 'cid:logo',
                          },
                        },
                      ],
                    },
                  ],
                },
                {
                  tagName: 'mj-section',
                  attributes: {
                    padding: '0 50px',
                  },
                  children: [
                    {
                      tagName: 'mj-column',
                      attributes: {},
                      children: [
                        {
                          tagName: 'mj-text',
                          attributes: {
                            padding: '8px 0',
                            'font-size': '32px',
                            'font-weight': '700',
                            'line-height': '2',
                            align: 'center',
                          },
                          content: StringUtils.nl2br(subject),
                        },
                        {
                          tagName: 'mj-text',
                          attributes: {
                            padding: '0',
                            'font-size': '16px',
                            'line-height': '1.4',
                          },
                          content: StringUtils.nl2br(message),
                        },
                        link && action
                          ? {
                              tagName: 'mj-button',
                              attributes: {
                                padding: '40px 0',
                                'inner-padding': '16px 76px',
                                'font-size': '16px',
                                'line-height': '1.4',
                                color: '#FFF',
                                'background-color': '#25B2FF',
                                'border-radius': '8px',
                                href: link,
                                target: '_blank',
                                rel: 'noopener noreferrer',
                              },
                              content: StringUtils.nl2br(action),
                            }
                          : undefined,
                        {
                          tagName: 'mj-text',
                          attributes: {
                            padding: '0',
                            'font-size': '16px',
                            'line-height': '1.4',
                          },
                          content: StringUtils.nl2br(extra),
                        },
                        {
                          tagName: 'mj-text',
                          attributes: {
                            padding: '24px 0',
                            'font-size': '16px',
                            'font-weight': '700',
                          },
                          content: StringUtils.nl2br(signature),
                        },
                      ].filter((obj) => obj),
                    },
                  ],
                },
                {
                  tagName: 'mj-section',
                  attributes: {
                    padding: '48px 0 0',
                  },
                  children: [
                    {
                      tagName: 'mj-column',
                      attributes: {},
                      children: [
                        {
                          tagName: 'mj-divider',
                          attributes: {
                            padding: '8px 0',
                            'border-width': '1px',
                            'border-color': '#9EADBD',
                          },
                        },
                        {
                          tagName: 'mj-text',
                          attributes: {
                            padding: '24px 0',
                            'font-size': '16px',
                            'font-weight': '700',
                            align: 'center',
                            color: '#828282',
                          },
                          content: footer,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const imageAttachments = base64Images.map((image) => {
      return {
        path: `data:image/jpeg;base64,${image}`,
      };
    });

    return {
      html: result.html,
      attachments: [
        {
          filename: 'logo.png',
          path: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmAAAAB9CAMAAAAyYi+OAAABv1BMVEUAAAAODg4EBASMjIwGBgYEBAQICAgJCQkJCQkDAwMAAAAODg4HBwcFBQUGBgYODg4JK0sIKkkIHTIJLEwJLEsHJkIJKkkHJT8JLEz///8Jj8bg5elGYXmElaUoRmJle4+jsLzCytLw8vTBy9InR2IYOVeTo7EIj8Z1iJoJMVPR1903U24JOFtWboRVnycXcK8IjsUZOVcJicAIXYkQf7oaaakJRGoJapjnoC0yiS0Og706jisJg7cUd7QJdqcJUXongi5hpiZboyYRfLgSerYVdbIYbawbY6MJZJDusS3rqi3ppC1AkitOmylKmClmqiVrqyT2xC3vtS3qpy3lmy1FlSpvsCMIgrcVVYxCTEQYVj0aejDzvy3yuy3sri10syN5tSKzvccTNUkLTT9+uCGyvccNh8AJfK8JcKESR3gJS3IKNFgnXjsJV4EmPUitfDVBdzXhlS7xuC3R2N5VboM3U20JPmMTO0ZJUEMScDPOkTBSii9lmCujr7sJdqgPXI5dWUBnYD90ZT0ubTbovi9akiyCuyEMNlw0REYfSkKAej3SojEKa5tGYHmQbTmdjTi6gTPWrjFIhTBLiC+HviAkdRgFAAAAGHRSTlMABhcBDxQCCQoZGAQTFhAM0ZojkOE8p06O63snAAAMVklEQVR42uyd9bPTQBCAYWCgM/yCzixNmoQ0CaWluLu7u7u7u7v7H8xZ3sUOCxm6zH7M8NrLy6VMPvb2Npe0X8yoESOBIP4KQ4cN75dm4AggiL/IiIEpv4YCQfxVhiYMG0Dxi/jrjBjQ59dwIIi/zqgBsWDDgCCgshA2iDIwogJGDpLxa8AQIIgKGDJACDaoPxBEBfSXhpFghKAiwQYMIcGIShisBBsMBFEBg/sLwfqTYASnKsGG1IAgACoQbJDI8UkwglOVYJSDEdVQoyGSqAodwQbQEElUQ40EI5JQBCNQUaM6GFElg4dQBCOqQOdgNIskUlCST+CBBCOqQa+mIMGINLSagkBDjWaRRBXoCEZDJFEhNZGDDaIyBVENtf4kGFEhtSFDaIgkElAORmBisMzBqExBJKBKPoGFGg2RRBZarpNlxrsZQPQk/8OK1hmn5syZ9vAsED0I/vVgM06dYH4tXTafFOtFmGCoZ5EzFkxRfi2fOHEXKdZzIB8iF0xifk1Tfq2YPp1SsV4D+RA5Je3XytNA9BasTIH52RQZv0iwngP5sylk/qX9GgdEb4E8B0uPj+Nu3t10Dn5G2HEbjUbXBqJy0F8q0n4xvY5cOnbo4I7nr+FHdMf4oyW+FztmW5Z1DTK0WCMAOJYBBxKEbjSGtY2J3EC32R34bZyW17as9pioG0KO0BUbjzcQ/ecYjDsHi/0Seh3ifm3auPjLTTBhW6OTHA5kK3vpQoYGawQAZ7QBJ9HrmES7pxQL2KEi+FXMHWkaft82C41ibIgcgFiw2K+zLHq9UH4tmTDhqUGxKGuJ1QEoK1iY7bUBnCZ/+VseBFIvTRSCJhyTOQgOarifcPhQjo+74N63hF/rNxRnYt5ozphWZzJMtj0RzHwHfiwYOH1cZfvqd6AILOXqca+pXkbAEK9d+HVsGaD8tucdb6s+A+hDNrW94025KQQUMMHw3rZ24fGFs7uYX1ywlF/bCwWL0oOLE8WBwCxYiiYTDLIE0tPGZNmnJ951+P46zAW2bf/Uh66031YduVbaMFeYOzk+SHsy4ABxHezCx82bPz+Bs7umr2SCpfxaVySYK05g8sQ0hG2lBAstfeIFjqXG3TCyxti6Kwd+TOBzM1ugEP4z2rGYVnJYbHhY/MJbyT/y5tnmzfv273/7CF7uYoKl/JqbE0yFmjakEKeplGBRLh9ypG2aXxPMijNCTUO4qz+iBQhhgmG8qyjW68qW1au5YvA85dfcPZBBni7LgTxlBAu0X2Z+LpgKr53sfrqxy+e8gBCcz6Z4xfXaJ/Q6sGbN1ju34HnKr9kFglmmnLuMYN4vBJZfEswqFJXn8x5wXKyC1YZgzMFuSb22rD5wYM3WtbNmXYS7Cb9mz16UFUxK5EMRJQQLf22m+HPBulrU3IcO41/wkUwcE2DNwW6p8MX1Wjtr2zYmWMKvQsEiFQzylBBMemFAxqRGunYWpSOVpdJCr/jT6bAbynwMH7UhGAXbzcOX0ov5dZkJpsdH5leBYE1jrCkh2A+sLRYsk6y78YEtQ1E26tOqqaoW2GCVfITftrZb6MX8EnpdZoJ9VX4JvRbtzQomT+F1KEKNRFYG/6eCybN+DQoxCAbNpEqHRZuKT1BAt2/m6/iyTuYic4xdi0S4XGe31uvOpw9PHt2C1+eeXrq0TsWvvXuPQhbfmAdJwfL8XDAVeAzowZBLZqvqv5sY6oI4AHaKh1q9QeyoaEeYHMP56IDdB6ReFx+/AoBx42fMmHFjHADc3POU+1Uk2OhKBDN3mhZM/1ro62zdVX6aq1xOYkPH0tfB8SiG8+v8dm9lft15cgTGLZx5csrYumDKglVnxsGRPbf37r2dF8z6iWCRncGrQjD1pgWCq7E9nZ8IpnD7FPNdQALOi927mV67Ydz5B3UG80uzYCHA0dsFgl01pkslkvyr5sTOKFg4Ou4mUIeVHvmmT9YGTafVVop1AAeDUV7s3n35MYybOqWeYRKXbd7U8XA0L1hkLLmXEOy+eWpqFAyasR6ebjZliK18fdVRa0IABzgvdl+4wPWaNDatl/rBFIM8tvGklBCsZS5TmAWz4w2W3rkpxs08h4vaHRHFrgMKkD6bYsY8NTTyH3nmjYcsoW+a8ZUQzDHX182CAU/z1VFtfbAi/QNtUu7fgiQLw/mVyquYV5O4XOzPzpmrzi9cuPD8qgXzWPSapKTLBzF1DvOUEAya5oHXLFhDmuUl8vewaPmr+VLnfWyCIYtgM3nUEo4tWDgONOMXLqgr8oaFfl4GOwBGCcFEiTaAIsyChb7oyE+Ofs2iRapB8aVOVIKhvKtohhwZp0wVdqk6GAjGz5TJ2KTxkKWVW1oTWFYXoIRgUox2mN5RHMMsmAxMoZtqdPx8OhdYyQAWgoZvQHLbB84yxdS60osXwnbWJSdnngEQik3iASxPlKlRdmVMKyGYEqMdpPZTx9CCtZIuqeO1msn5odL/uO5IFlb1fkG7kfpdH3CANMlfUF/AQ9R4Npccy/+MVcn9KtE6r74KihATfEveDhnyW8TKCwa26LNv7+C4qiEkBXP5y0xP7Wxdzkt3FPLj60GUR7OG0E+56AEOWCV/AMLHN42bKv7KTSHH7pQboJhotMSyLPWqBVBOMHB9qW3LtrutMfKNA6AFUxI22GYHOEKRfPruyUavqzvSWlpqG9+kDoGDwXifD3ZjnvBLhLC4CjZJlCjMuEosxZgOMEoJJm7zSNN2gKP9CH21xYZkg5c7YgY//n2lscbH4hfOWaRgYV2g5FLzSl58nXIGjKQUUzf9lBRMjmYaX1qVFAzctGDKpZwkTjPVUeLukYzGY9D4hXMWKRi/k5klCl9TTp6a+WDBlHSV1UynFXmeF7n69AXs/XvI0GWNkKLleQ0oxHGVGv6YVl+3bP9u3zGbPt/o9L03FOU6Xjt2qDE594F8dQwkE0gG1kIrQxjGeDA19unGqnliMjke/gkd27adyfBruOZC1mTb3JHDNuEJXgzMQyQz7GT95AxIsnBnfSaKR4Q1kd7l+Ltgf7rOGQBeClt1asEpthaMvz4DGAgQ1RlKUhuC/CuVx5+qx8wcD0jgFQlkQ92fgfW2tQQ7630gGR4BAkTrucrxP3wp/PlYsSnnAQFet9tAtNqmJFww9F/nN34mX1cxdhWK8MVWkKFakFoS1GWKGK4YmvyL1XRRXekpCe4yBUZExbXdQPN4r5JgL1MQPQ/Omz4INOCfRRI9Dfav8yN6HJxLpgk0UA5GVEoN5cNPCDTgfAAdgQYqtBKVUsN52xqBBbxr8gkU0BBJ5KFCK4EFGiKJCvkPlkwTvU0N5WPMCTQwwTB+nR+BBZpFfmfvjlEAhmEYAK6BLC2U1v9/aad2yRoPgrtHWKDBolHsfzBSuGAs9GDE0IPRaszpgtFnRG4VEUNE0ih1bY0YIpJFSw92FWx3/BF5Fmx3j+91wFPwtm+1vc2DMLBA2qSBwBo9L/v/v3TGPnpIUfeJj1xIbJ/PJpZQNmnacJzvf1tb5idsYjheyxoDDtj59T0xMRRf5/uAuZLP+Q2bGIrXmYuTA2a/hC3p+PtvfsUmBuHP6/+Rls099IA96ifsft/3/VnvZzVP/1RHjMEYFTTJbkZpX1nKPcxuDyTlMs8ke8v6ztfuFO0C0zbOi6lgG03ifbXGa6CdUWw12B4PCRBJga8N5vzD5t/9PZdVz5f9ubvkdPgOR70OUuQBhBXMUATLW/uxt7kEGVKdXhacT2pN6cLOdK0KOfLMo+2cf9T8wqdcVhduhlBP2JJTSvcKtbLwgL0yVGEhizaMO46EXr8DItajgnmVwCVJV8C9U//GALKqmvMPmz/lpaz2AxInLK5bWYAsl4EOgwtzrSKXyZG0jFgWYiGSMjIsY79s9ZSyB5sT3KTf9jrBnH/U/KVszgUcMJww59ZtrdhkbW+rl0BdXchuaiARB0ojQDZJ39UkWtJigA4fF4ddxRCUoDv2AcfbRkGa76b8nH/M/ALnYryFGxHkiMXoGmLv0EcYBUxTyyCa0zVEcc9SeoXJKdHel870e3Grj0wBYAB2jegz5x8wvwlCsONFCPOoqDaoCRYaZZyG+oRMeVNQoKsvQSwAiwpWq4ETUB+a20IBWTRADcrhkOz3RkFsSva1eM4/bH4crw+QZJAnIwWM5eAQVCAPURODQRb0VQ826MWIQUtjIerfDvkPrQNqoIVszj92/h4/rw7woiWpsdcAAAAASUVORK5CYII=',
          cid: 'logo',
        },
        ...imageAttachments,
      ],
    };
  }

  private createSendMailOptions(
    lang: Language,
    type: EmailType,
    link: string,
    inviter = '',
  ): SendMailOptions {
    const i18nLanguage = StringUtils.convertToI18nFormat(lang);
    let subject = '';
    let action = '';
    let message = '';
    let extra = '';
    const signature = this.i18nService.t<string>('mail.signature', {
      lang: i18nLanguage,
    });
    const footer = this.i18nService.t<string>('mail.footer', {
      lang: i18nLanguage,
    });
    switch (type) {
      case EmailType.REGISTER_ACCOUNT: {
        subject = this.i18nService.t<string>('mail.invite.subject', {
          lang: i18nLanguage,
          args: { username: inviter },
        });
        action = this.i18nService.t<string>('mail.invite.action', {
          lang: i18nLanguage,
        });
        return {
          ...this.renderMail({
            subject,
            action,
            link,
            signature,
            footer,
          }),
          subject: StringUtils.nl2space(subject),
        };
      }
      case EmailType.DEVICE_BINDING:
        subject = this.i18nService.t<string>('mail.login.subject', {
          lang: i18nLanguage,
        });
        message = this.i18nService.t<string>('mail.login.message', {
          lang: i18nLanguage,
        });
        action = this.i18nService.t<string>('mail.login.action', {
          lang: i18nLanguage,
        });
        extra = this.i18nService.t<string>('mail.login.extra', {
          lang: i18nLanguage,
        });
        return {
          ...this.renderMail({
            subject,
            message,
            action,
            extra,
            link,
            signature,
            footer,
          }),
          subject: StringUtils.nl2space(subject),
        };
      case EmailType.FORGOT_PASSWORD:
        subject = this.i18nService.t<string>('mail.resetPassword.subject', {
          lang: i18nLanguage,
        });
        message = this.i18nService.t<string>('mail.resetPassword.message', {
          lang: i18nLanguage,
        });
        action = this.i18nService.t<string>('mail.resetPassword.action', {
          lang: i18nLanguage,
        });
        return {
          ...this.renderMail({
            subject,
            message,
            action,
            link,
            signature,
            footer,
          }),
          subject: StringUtils.nl2space(subject),
        };
      default:
        throw new Error('Unsupported Email Type');
    }
  }

  private createSendContactUsMailOptions(
    name: string,
    description: string,
    email: string,
    organization = '',
    phone = '',
  ): SendMailOptions {
    const i18nLanguage = StringUtils.convertToI18nFormat(Language.en_US);
    const signature = this.i18nService.t<string>('mail.signature', {
      lang: i18nLanguage,
    });
    const footer = this.i18nService.t<string>('mail.footer', {
      lang: i18nLanguage,
    });
    const subject = this.i18nService.t<string>('mail.contact.subject', {
      lang: i18nLanguage,
      args: {
        organization: organization || name,
      },
    });
    const message = this.i18nService.t<string>('mail.contact.message', {
      lang: i18nLanguage,
      args: {
        organization: organization,
        name: name,
        phone: phone,
        email: email,
        message: description,
      },
    });

    return {
      ...this.renderMail({
        subject,
        message,
        signature,
        footer,
      }),
      subject: StringUtils.nl2space(subject),
    };
  }

  private async createSendAutomationNotidyMailOptions(
    language: Language,
    textMessage: string,
    link: string,
    base64Images: string[],
  ): Promise<SendMailOptions> {
    const i18nLanguage = StringUtils.convertToI18nFormat(language);
    const signature = this.i18nService.t<string>('mail.signature', {
      lang: i18nLanguage,
    });
    const footer = this.i18nService.t<string>('mail.footer', {
      lang: i18nLanguage,
    });
    const subject = this.i18nService.t<string>(
      'mail.automationNotify.subject',
      {
        lang: i18nLanguage,
      },
    );
    const message = this.i18nService.t<string>(
      'mail.automationNotify.message',
      {
        lang: i18nLanguage,
        args: {
          message: textMessage,
        },
      },
    );
    const action = this.i18nService.t<string>('mail.automationNotify.action', {
      lang: i18nLanguage,
    });

    return {
      ...this.renderMail({
        message,
        subject,
        action,
        link,
        signature,
        footer,
        base64Images,
      }),
      subject: StringUtils.nl2space(subject),
    };
  }

  private async sendMail(
    receiverMail: string,
    options: SendMailOptions,
  ): Promise<SMTPTransport.SentMessageInfo> {
    /* return this.mailerService.sendMail({
      to: receiverMail,
      // from: '"Support Team" <support@noodoe.com>', // override default from
      ...options,
    }); */
    return this.mailTransport.sendMail({
      from: this.configService.get<string>('SMTP_MAIL_SERVER_DEFALUT_FROM'),
      to: receiverMail,
      ...options,
    });
  }
}
