import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { Constants } from 'src/constants';
import { Device } from 'src/models/device';
import StringUtils from 'src/utils/StringUtils';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { ElasticsearchSensorService } from '../elasticsearch-sensor/elasticsearch-sensor.service';
import { GoogleClientModule } from '../google-client/google-client/google-client.module';
import { GroupService } from '../group/group.service';
import { LampService } from '../lamp/lamp.service';
import { SensorService } from '../sensor/sensor.service';
import { DeviceService } from './device.service';

const groupServiceMock: () => MockType<GroupService> = jest.fn(() => ({
  create: jest.fn(),
}));

const sensorServiceMock: () => MockType<SensorService> = jest.fn(() => ({
  create: jest.fn(),
  updateSensor: jest.fn(),
}));

const lampServiceMock: () => MockType<LampService> = jest.fn(() => ({
  updateLampSchedule: jest.fn(),
}));

const elasticsearchSensorServiceMock: () => MockType<ElasticsearchSensorService> =
  jest.fn(() => ({
    elasticSearchSetting: jest.fn(),
  }));

describe('DeviceService', () => {
  let service: DeviceService;
  const mockDeviceModel = {
    findOne: jest.fn(),
  };
  const mockLampModel = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '../env/cityos_env',
        }),
        ChtiotClientModule,
        GoogleClientModule,
        ConfigModule,
      ],
      providers: [
        DeviceService,
        {
          provide: getModelToken('Device'),
          useValue: mockDeviceModel,
        },
        {
          provide: getModelToken('Lamp'),
          useValue: mockLampModel,
        },
        {
          provide: GroupService,
          useFactory: groupServiceMock,
        },
        {
          provide: SensorService,
          useFactory: sensorServiceMock,
        },
        {
          provide: LampService,
          useFactory: lampServiceMock,
        },
        {
          provide: ElasticsearchSensorService,
          useFactory: elasticsearchSensorServiceMock,
        },
      ],
    }).compile();

    service = module.get<DeviceService>(DeviceService);
  });

  it('deviceType should be as same as from the attributes', async () => {
    expect(service).toBeDefined();

    jest.spyOn(service, 'getDeviceById').mockResolvedValue(new Device());
    const response = await service.devicesFromIOT('PK9KB2K4FGXMT39Z9G');
    response.forEach((device) => {
      device.attributes.forEach((attribute) => {
        if (attribute.key === Constants.KEY_ATTR_DEVICE_TYPE) {
          expect(device.type).toEqual(
            StringUtils.deviceTypeFrom(attribute.value),
          );
        }
      });
    });
  });
});
