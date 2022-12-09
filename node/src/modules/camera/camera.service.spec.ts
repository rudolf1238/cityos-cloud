import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { DeviceService } from '../device/device.service';
import { ElasticsearchSensorService } from '../elasticsearch-sensor/elasticsearch-sensor.service';
import { CameraService } from './camera.service';

const deviceServiceMock: () => MockType<DeviceService> = jest.fn(() => ({
  getDeviceById: jest.fn(),
  searchDevices: jest.fn(),
}));

const mockLiveViewModel = jest.fn();

const elasticsearchSensorServiceMock: () => MockType<ElasticsearchSensorService> =
  jest.fn(() => ({
    elasticSearchSetting: jest.fn(),
  }));

describe('CameraService', () => {
  let service: CameraService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        HttpModule,
        ConfigModule,
        ElasticsearchModule.register({
          node: 'http://localhost:9200',
        }),
      ],
      providers: [
        CameraService,
        {
          provide: DeviceService,
          useFactory: deviceServiceMock,
        },
        {
          provide: getModelToken('LiveView'),
          useValue: mockLiveViewModel,
        },
        {
          provide: ElasticsearchSensorService,
          useFactory: elasticsearchSensorServiceMock,
        },
      ],
    }).compile();

    service = module.get<CameraService>(CameraService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
