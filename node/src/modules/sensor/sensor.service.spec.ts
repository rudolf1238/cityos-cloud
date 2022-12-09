import { ConfigService } from '@nestjs/config';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import { DeviceService } from '../device/device.service';
import { ElasticsearchSensorService } from '../elasticsearch-sensor/elasticsearch-sensor.service';
import { GroupService } from '../group/group.service';
import { LogService } from '../log/log.service';
import { SensorService } from './sensor.service';

const chtiotClientServiceMock: () => MockType<ChtiotClientService> = jest.fn(
  () => ({
    editDevice: jest.fn(),
    updateSensor: jest.fn(),
  }),
);

const configServiceMock: () => MockType<ConfigService> = jest.fn(() => ({
  get: jest.fn(),
}));

const deviceServiceMock: () => MockType<DeviceService> = jest.fn(() => ({
  getDeviceById: jest.fn(),
}));

const groupServiceMock: () => MockType<GroupService> = jest.fn(() => ({
  searchGroups: jest.fn(),
}));

const logServiceMock: () => MockType<LogService> = jest.fn(() => ({
  insertEvent: jest.fn(),
}));

const elasticsearchSensorServiceMock: () => MockType<ElasticsearchSensorService> =
  jest.fn(() => ({
    elasticSearchSetting: jest.fn(),
  }));

describe('SensorService', () => {
  let service: SensorService;

  beforeEach(async () => {
    const mockSensorModel = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ElasticsearchModule.register({
          node: 'http://localhost:9200',
        }),
      ],
      providers: [
        SensorService,
        {
          provide: getModelToken('Sensor'),
          useValue: mockSensorModel,
        },
        {
          provide: ChtiotClientService,
          useFactory: chtiotClientServiceMock,
        },
        {
          provide: ConfigService,
          useFactory: configServiceMock,
        },
        {
          provide: DeviceService,
          useFactory: deviceServiceMock,
        },
        {
          provide: LogService,
          useFactory: logServiceMock,
        },
        {
          provide: GroupService,
          useFactory: groupServiceMock,
        },
        {
          provide: ElasticsearchSensorService,
          useFactory: elasticsearchSensorServiceMock,
        },
      ],
    }).compile();

    service = module.get<SensorService>(SensorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
