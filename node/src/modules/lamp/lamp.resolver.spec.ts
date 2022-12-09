import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { DeviceService } from '../device/device.service';
import { AbilityFactory } from '../permission/ability.factory';
import { LampResolver } from './lamp.resolver';
import { LampService } from './lamp.service';

const deviceServiceMock: () => MockType<DeviceService> = jest.fn(() => ({
  getDeviceById: jest.fn(),
  searchDevices: jest.fn(),
}));

describe('LampResolver', () => {
  let resolver: LampResolver;

  beforeEach(async () => {
    const mockLampModel = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ChtiotClientModule,
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '../env/cityos_env',
        }),
      ],
      providers: [
        LampResolver,
        LampService,
        {
          provide: getModelToken('Lamp'),
          useValue: mockLampModel,
        },
        {
          provide: DeviceService,
          useFactory: deviceServiceMock,
        },
        AbilityFactory,
      ],
    }).compile();

    resolver = module.get<LampResolver>(LampResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
