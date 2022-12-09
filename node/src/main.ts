import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'path';
import { AppModule } from './app.module';
import { GoogleRecaptchaFilter } from './modules/auth/google.recaptcha.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

declare const module: any;

const port = process.env.PORT || 4000;
const host = process.env.HOST || '0.0.0.0';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger:
      process.env.NODE_ENV === 'production'
        ? ['error', 'warn', 'log']
        : ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  app.useGlobalFilters(new GoogleRecaptchaFilter());
  app.enableCors();
  app.useStaticAssets(resolve('./src/public'));
  app.setBaseViewsDir(resolve('./src/views'));
  app.setViewEngine('html');
  app.setViewEngine('hbs');

  // //connect swagger aip document services
  const config = new DocumentBuilder()
    .setTitle('CityOS API Example')
    .setDescription('The API description')
    .setVersion('1.0') // match tags in controllers
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('v1/api/', app, document);

  await app.listen(port, host);
  Logger.log(`🚀 Server running on http://${host}:${port}`, 'Bootstrap');

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (module.hot) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    module.hot.accept();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    module.hot.dispose(() => app.close());
  }
}
void bootstrap();
