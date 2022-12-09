import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ChtiotClientModule } from './modules/chtiot-client/chtiot-client.module';
import { LineService } from './modules/line/line.service';

const lineServiceMock: () => MockType<LineService> = jest.fn(() => ({
  lineBinding: jest.fn(),
}));

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule, ChtiotClientModule],
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: LineService,
          useFactory: lineServiceMock,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return the correct appVersion.', () => {
      const result = `Welcome to CityOS Server (v${process.env.npm_package_version})`;
      expect(appController.getHello()).toBe(result);
    });
  });
});

export type MockType<T> = {
  [P in keyof T]?: jest.Mock<any>;
};
