import { BullModule } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import { DeviceService } from '../device/device.service';
import { GroupService } from '../group/group.service';
import { LogService } from '../log/log.service';
import { AbilityFactory } from '../permission/ability.factory';
import { SensorService } from '../sensor/sensor.service';
import { ElasticsearchSensorResolver } from './elasticsearch-sensor.resolver';
import { ElasticsearchSensorService } from './elasticsearch-sensor.service';

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

const sensorServiceMock: () => MockType<SensorService> = jest.fn(() => ({
  create: jest.fn(),
}));

describe('ElasticsearchSensorResolver', () => {
  let resolver: ElasticsearchSensorResolver;
  const mockEsSensorModel = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ElasticsearchModule.register({
          node: 'http://localhost:9200',
        }),
        BullModule.registerQueue({
          name: 'elasticsearch',
        }),
      ],
      providers: [
        ElasticsearchSensorResolver,
        ElasticsearchSensorService,
        {
          provide: getModelToken('ElasticSearchSensor'),
          useValue: mockEsSensorModel,
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
          provide: SensorService,
          useFactory: sensorServiceMock,
        },
        AbilityFactory,
      ],
    }).compile();

    resolver = module.get<ElasticsearchSensorResolver>(
      ElasticsearchSensorResolver,
    );
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
