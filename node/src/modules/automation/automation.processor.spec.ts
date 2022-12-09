import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DateTime, IANAZone } from 'luxon';
import { Types } from 'mongoose';
import { I18nModule, QueryResolver } from 'nestjs-i18n';
import { getModelToken } from '@nestjs/mongoose';
import path from 'path';
import { MockType } from 'src/app.controller.spec';
import {
  DeviceType,
  GaugeSensorData,
  Logic,
  SensorType,
  SnapshotSensorData,
  SwitchSensorData,
  TextSensorData,
  TriggerOperator,
} from 'src/graphql.schema';
import { AutomationTrigger } from 'src/models/automation.trigger';
import { Device } from 'src/models/device';
import { EffectiveDate, EffectiveTime } from 'src/models/rule.automation';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import { DeviceService } from '../device/device.service';
import { LineClient } from '../line/line.client';
import { MailService } from '../mail/mail.service';
import { AutomationProcessor } from './automation.processor';
import { AutomationService } from './automation.service';
import { Sensor } from 'src/models/sensor';

const getSensor = function (
  this: Device,
  sensorId: string,
): Sensor | undefined {
  return this.sensors.find((it) => it.sensorId === sensorId);
};

const device01: Device = {
  _id: new Types.ObjectId(),
  id: 'device01',
  name: 'lamp01',
  deviceId: 'lamp01',
  type: DeviceType.LAMP,
  groups: [
    {
      _id: new Types.ObjectId(),
      id: 'division01',
      name: 'Division Taipei City',
      projectKey: 'AZAZKEY010101',
      ancestors: [],
      toApolloGroup: null,
    },
  ],
  sensors: [
    {
      _id: new Types.ObjectId(),
      id: 'setBrightnessPercent',
      sensorId: 'setBrightnessPercent',
      iotSensorId: 'setBrightnessPercent',
      type: SensorType.GAUGE,
      name: 'setBrightnessPercent',
      unit: '%',
      attributes: [],
    },
    {
      _id: new Types.ObjectId(),
      id: 'brightnessPercent',
      sensorId: 'brightnessPercent',
      iotSensorId: 'brightnessPercent',
      type: SensorType.GAUGE,
      name: 'brightnessPercent',
      unit: '%',
      attributes: [],
    },
    {
      _id: new Types.ObjectId(),
      id: 'status',
      sensorId: 'status',
      iotSensorId: 'status',
      type: SensorType.TEXT,
      name: 'status',
      attributes: [],
    },
    {
      _id: new Types.ObjectId(),
      id: 'isHealth',
      sensorId: 'isHealth',
      iotSensorId: 'isHealth',
      type: SensorType.SWITCH,
      name: 'isHealth',
      attributes: [],
    },
    {
      _id: new Types.ObjectId(),
      id: 'image',
      sensorId: 'image',
      iotSensorId: 'image',
      type: SensorType.SNAPSHOT,
      name: 'image',
      attributes: [],
    },
  ],
  attributes: [],
  timezone: {
    rawOffset: 28800,
    timeZoneId: 'Asia/Taipei',
    timeZoneName: 'Taipei Standard Time',
  },
  address: [],
  toApolloDevice: null,
  recognitionType: null,
  uri: '',
  getSensor: getSensor,
};

const device02: Device = {
  _id: new Types.ObjectId(),
  id: 'device02',
  name: 'lamp02',
  deviceId: 'lamp02',
  type: DeviceType.LAMP,
  groups: [
    {
      _id: new Types.ObjectId(),
      id: 'division01',
      name: 'Division Taipei City',
      projectKey: 'AZAZKEY010101',
      ancestors: [],
      toApolloGroup: null,
    },
  ],
  sensors: [
    {
      _id: new Types.ObjectId(),
      id: 'setBrightnessPercent',
      sensorId: 'setBrightnessPercent',
      iotSensorId: 'setBrightnessPercent',
      type: SensorType.GAUGE,
      name: 'setBrightnessPercent',
      unit: '%',
      attributes: [],
    },
    {
      _id: new Types.ObjectId(),
      id: 'brightnessPercent',
      sensorId: 'brightnessPercent',
      iotSensorId: 'brightnessPercent',
      type: SensorType.GAUGE,
      name: 'brightnessPercent',
      unit: '%',
      attributes: [],
    },
    {
      _id: new Types.ObjectId(),
      id: 'status',
      sensorId: 'status',
      iotSensorId: 'status',
      type: SensorType.TEXT,
      name: 'status',
      attributes: [],
    },
    {
      _id: new Types.ObjectId(),
      id: 'isHealth',
      sensorId: 'isHealth',
      iotSensorId: 'isHealth',
      type: SensorType.SWITCH,
      name: 'isHealth',
      attributes: [],
    },
    {
      _id: new Types.ObjectId(),
      id: 'image',
      sensorId: 'image',
      iotSensorId: 'image',
      type: SensorType.SNAPSHOT,
      name: 'image',
      attributes: [],
    },
  ],
  attributes: [],
  timezone: {
    rawOffset: 28800,
    timeZoneId: 'Asia/Taipei',
    timeZoneName: 'Taipei Standard Time',
  },
  address: [],
  toApolloDevice: null,
  recognitionType: null,
  uri: '',
  getSensor: getSensor,
};

const chtiotClientServiceMock: () => MockType<ChtiotClientService> = jest.fn(
  () => ({
    sensorValueRaw: jest.fn(
      (
        projectKey: string,
        deviceId: string,
        sensorId: string,
        sensorType: SensorType,
      ) => {
        switch (sensorType) {
          case SensorType.GAUGE: {
            let value = 0;
            switch (deviceId) {
              case 'lamp01': {
                if (sensorId === 'setBrightnessPercent') {
                  value = 50;
                } else if (sensorId === 'brightnessPercent') {
                  value = 50;
                } else {
                  value = 0;
                }
                break;
              }
              case 'lamp02': {
                if (sensorId === 'setBrightnessPercent') {
                  value = 70;
                } else if (sensorId === 'brightnessPercent') {
                  value = 70;
                } else {
                  value = 0;
                }
                break;
              }
            }
            const gaugeSensorData: GaugeSensorData = {
              type: SensorType.GAUGE,
              time: new Date(),
              value,
            };
            return gaugeSensorData;
          }
          case SensorType.TEXT: {
            let value = '';
            switch (deviceId) {
              case 'lamp01': {
                value = 'available';
                break;
              }
              case 'lamp02': {
                value = 'alarm';
                break;
              }
            }
            const textSensorData: TextSensorData = {
              type: SensorType.TEXT,
              time: new Date(),
              value,
            };
            return textSensorData;
          }
          case SensorType.SWITCH: {
            let value = true;
            switch (deviceId) {
              case 'lamp01': {
                value = true;
                break;
              }
              case 'lamp02': {
                value = false;
                break;
              }
            }
            const switchSensorData: SwitchSensorData = {
              type: SensorType.SWITCH,
              time: new Date(),
              value,
            };
            return switchSensorData;
          }
          case SensorType.SNAPSHOT: {
            const time = DateTime.fromISO('2022-04-06T22:04:55.000Z')
              .setZone(IANAZone.create('Asia/Bangkok')) // UTC+7
              .toJSDate();
            const snapshotSensorData: SnapshotSensorData = {
              type: SensorType.SNAPSHOT,
              time,
              value: 'https://www.example.net/images/image1.jpg',
            };
            return snapshotSensorData;
          }
        }
      },
    ),
  }),
);

const lineClientMock: () => MockType<LineClient> = jest.fn(() => ({
  sendMessageByNotify: jest.fn(),
}));

const automationServiceMock: () => MockType<AutomationService> = jest.fn(
  () => ({
    searchRules: jest.fn(),
  }),
);

const mailServiceMock: () => MockType<MailService> = jest.fn(() => ({
  sendAutomationNotifyMail: jest.fn(),
}));

const deviceServiceMock: () => MockType<DeviceService> = jest.fn(() => ({
  searchDevices: jest.fn(),
}));

const mockRuleAuditLogModel = jest.fn();

describe('AutomationProcessor', () => {
  let processor: AutomationProcessor;

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
          resolvers: [{ use: QueryResolver, options: ['lang'] }],
        }),
      ],
      providers: [
        AutomationProcessor,
        AutomationService,
        {
          provide: ChtiotClientService,
          useFactory: chtiotClientServiceMock,
        },
        {
          provide: LineClient,
          useFactory: lineClientMock,
        },
        {
          provide: AutomationService,
          useFactory: automationServiceMock,
        },
        {
          provide: MailService,
          useFactory: mailServiceMock,
        },
        {
          provide: DeviceService,
          useFactory: deviceServiceMock,
        },
        {
          provide: getModelToken('RuleAuditLog'),
          useValue: mockRuleAuditLogModel,
        },
      ],
    }).compile();

    processor = module.get<AutomationProcessor>(AutomationProcessor);
  });

  it('should work correct for isEffectiveDate', () => {
    expect(processor).toBeDefined();
    let timezone = 'Asia/Taipei';
    let now = DateTime.fromISO('2022-04-06T15:05:00.000Z').setZone(
      IANAZone.create(timezone),
    );

    let effectiveDate: EffectiveDate = {
      startMonth: 1,
      startDay: 1,
      endMonth: 12,
      endDay: 31,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(true);

    effectiveDate = {
      startMonth: 4,
      startDay: 15,
      endMonth: 6,
      endDay: 1,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(false);

    effectiveDate = {
      startMonth: 4,
      startDay: 15,
      endMonth: 3,
      endDay: 30,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(false);

    effectiveDate = {
      startMonth: 4,
      startDay: 15,
      endMonth: 4,
      endDay: 6,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(true);

    effectiveDate = {
      startMonth: 4,
      startDay: 15,
      endMonth: 4,
      endDay: 10,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(true);

    effectiveDate = {
      startMonth: 4,
      startDay: 6,
      endMonth: 4,
      endDay: 6,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(true);

    effectiveDate = {
      startMonth: 4,
      startDay: 6,
      endMonth: 5,
      endDay: 1,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(true);

    effectiveDate = {
      startMonth: 4,
      startDay: 6,
      endMonth: 3,
      endDay: 1,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(true);

    effectiveDate = {
      startMonth: 3,
      startDay: 1,
      endMonth: 3,
      endDay: 30,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(false);

    effectiveDate = {
      startMonth: 3,
      startDay: 1,
      endMonth: 4,
      endDay: 6,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(true);

    effectiveDate = {
      startMonth: 3,
      startDay: 1,
      endMonth: 5,
      endDay: 1,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(true);

    effectiveDate = {
      startMonth: 3,
      startDay: 1,
      endMonth: 2,
      endDay: 1,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(true);

    timezone = 'Asia/Magadan'; // UTC+11
    now = DateTime.fromISO('2022-04-06T15:05:00.000Z').setZone(
      IANAZone.create(timezone),
    );
    effectiveDate = {
      startMonth: 3,
      startDay: 1,
      endMonth: 4,
      endDay: 6,
    };
    expect(processor.isEffectiveDate(now, timezone, effectiveDate)).toBe(false);
  });

  it('should work correct for isEffectiveWeekday', () => {
    expect(processor).toBeDefined();
    const timezone = 'Asia/Taipei';
    const now = DateTime.fromISO('2022-04-06T22:05:00.000Z').setZone(
      IANAZone.create(timezone),
    );

    let effectiveWeekday = [1, 2, 3, 4, 5, 6, 7];
    expect(processor.isEffectiveWeekday(now, effectiveWeekday)).toBe(true);

    effectiveWeekday = [4, 5, 6, 7];
    expect(processor.isEffectiveWeekday(now, effectiveWeekday)).toBe(true);

    effectiveWeekday = [1, 2, 3];
    expect(processor.isEffectiveWeekday(now, effectiveWeekday)).toBe(false);
  });

  it('should work correct for isEffectiveTime', () => {
    expect(processor).toBeDefined();
    let timezone = 'Asia/Taipei';
    let now = DateTime.fromISO('2022-04-06T06:05:00.000Z').setZone(
      IANAZone.create(timezone),
    );

    let effectiveTime: EffectiveTime = {
      fromHour: 0,
      fromMinute: 0,
      toHour: 23,
      toMinute: 59,
    };
    expect(processor.isEffectiveTime(now, effectiveTime)).toBe(true);

    effectiveTime = {
      fromHour: 10,
      fromMinute: 0,
      toHour: 12,
      toMinute: 0,
    };
    expect(processor.isEffectiveTime(now, effectiveTime)).toBe(false);

    effectiveTime = {
      fromHour: 10,
      fromMinute: 0,
      toHour: 15,
      toMinute: 0,
    };
    expect(processor.isEffectiveTime(now, effectiveTime)).toBe(true);

    effectiveTime = {
      fromHour: 10,
      fromMinute: 0,
      toHour: 5,
      toMinute: 0,
    };
    expect(processor.isEffectiveTime(now, effectiveTime)).toBe(true);

    effectiveTime = {
      fromHour: 14,
      fromMinute: 5,
      toHour: 14,
      toMinute: 10,
    };
    expect(processor.isEffectiveTime(now, effectiveTime)).toBe(true);

    effectiveTime = {
      fromHour: 14,
      fromMinute: 10,
      toHour: 17,
      toMinute: 0,
    };
    expect(processor.isEffectiveTime(now, effectiveTime)).toBe(false);

    effectiveTime = {
      fromHour: 14,
      fromMinute: 10,
      toHour: 10,
      toMinute: 0,
    };
    expect(processor.isEffectiveTime(now, effectiveTime)).toBe(false);

    effectiveTime = {
      fromHour: 18,
      fromMinute: 10,
      toHour: 15,
      toMinute: 0,
    };
    expect(processor.isEffectiveTime(now, effectiveTime)).toBe(true);

    // cross the day
    timezone = 'Asia/Taipei';
    now = DateTime.fromISO('2022-04-06T22:05:00.000Z').setZone(
      IANAZone.create(timezone),
    );

    effectiveTime = {
      fromHour: 6,
      fromMinute: 0,
      toHour: 7,
      toMinute: 0,
    };
    expect(processor.isEffectiveTime(now, effectiveTime)).toBe(true);

    effectiveTime = {
      fromHour: 23,
      fromMinute: 0,
      toHour: 7,
      toMinute: 0,
    };
    expect(processor.isEffectiveTime(now, effectiveTime)).toBe(true);
  });

  it('should check condition correctly when the data is number', async () => {
    expect(processor).toBeDefined();

    const timezone = 'Asia/Taipei';
    const now = DateTime.fromISO('2022-04-06T22:05:00.000Z').setZone(
      IANAZone.create(timezone),
    );

    // #1. both devices do not meet the condition
    let triggers: AutomationTrigger[] = [];
    let trigger: AutomationTrigger = {
      _id: new Types.ObjectId(),
      id: 'trigger1',
      deviceType: DeviceType.LAMP,
      devices: [device01, device02],
      logic: Logic.AND,
      conditions: [
        {
          sensorId: 'setBrightnessPercent',
          operator: TriggerOperator.GREATER,
          value: '80',
        },
        {
          sensorId: 'brightnessPercent',
          operator: TriggerOperator.GREATER,
          value: '80',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    triggers.push(trigger);

    let checkCondition = await processor.checkCondition(
      'rule01',
      now,
      triggers,
      Logic.AND,
    );
    expect(checkCondition.isTrigger).toBe(false);

    // #2. 2nd device meets the condition
    triggers = [];
    trigger = {
      _id: new Types.ObjectId(),
      id: 'trigger1',
      deviceType: DeviceType.LAMP,
      devices: [device01, device02],
      logic: Logic.AND,
      conditions: [
        {
          sensorId: 'setBrightnessPercent',
          operator: TriggerOperator.GREATER,
          value: '60',
        },
        {
          sensorId: 'brightnessPercent',
          operator: TriggerOperator.GREATER,
          value: '60',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    triggers.push(trigger);

    checkCondition = await processor.checkCondition(
      'rule01',
      now,
      triggers,
      Logic.AND,
    );
    expect(checkCondition.isTrigger).toBe(true);
    expect(
      checkCondition.triggeredExpression.find((it) => it.lang === 'en-US')
        .message,
    ).toBe(
      '(lamp02 setBrightnessPercent > 60 % AND lamp02 brightnessPercent > 60 %)',
    );
    expect(
      checkCondition.triggeredCurrentValue.find((it) => it.lang === 'en-US')
        .message,
    ).toBe(
      'lamp02 setBrightnessPercent = 70 %, lamp02 brightnessPercent = 70 %',
    );

    // #3. 2nd device meets the condition (OR)
    triggers = [];
    trigger = {
      _id: new Types.ObjectId(),
      id: 'trigger1',
      deviceType: DeviceType.LAMP,
      devices: [device01, device02],
      logic: Logic.OR,
      conditions: [
        {
          sensorId: 'setBrightnessPercent',
          operator: TriggerOperator.GREATER_OR_EQUAL,
          value: '80',
        },
        {
          sensorId: 'brightnessPercent',
          operator: TriggerOperator.GREATER_OR_EQUAL,
          value: '70',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    triggers.push(trigger);

    checkCondition = await processor.checkCondition(
      'rule01',
      now,
      triggers,
      Logic.AND,
    );
    expect(checkCondition.isTrigger).toBe(true);
    expect(
      checkCondition.triggeredExpression.find((it) => it.lang === 'en-US')
        .message,
    ).toBe('(lamp02 brightnessPercent >= 70 %)');
    expect(
      checkCondition.triggeredCurrentValue.find((it) => it.lang === 'en-US')
        .message,
    ).toBe('lamp02 brightnessPercent = 70 %');

    // #4. two triggers do not meet the condition
    triggers = [];
    trigger = {
      _id: new Types.ObjectId(),
      id: 'trigger1',
      deviceType: DeviceType.LAMP,
      devices: [device01],
      logic: Logic.OR,
      conditions: [
        {
          sensorId: 'setBrightnessPercent',
          operator: TriggerOperator.GREATER_OR_EQUAL,
          value: '40',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    const trigger2: AutomationTrigger = {
      _id: new Types.ObjectId(),
      id: 'trigger2',
      deviceType: DeviceType.LAMP,
      devices: [device02],
      logic: Logic.OR,
      conditions: [
        {
          sensorId: 'setBrightnessPercent',
          operator: TriggerOperator.GREATER_OR_EQUAL,
          value: '90',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    triggers.push(trigger);
    triggers.push(trigger2);

    checkCondition = await processor.checkCondition(
      'rule01',
      now,
      triggers,
      Logic.AND,
    );
    expect(checkCondition.isTrigger).toBe(false);
  });

  it('should check condition correctly when the data is text', async () => {
    expect(processor).toBeDefined();

    const timezone = 'Asia/Taipei';
    const now = DateTime.fromISO('2022-04-06T22:05:00.000Z').setZone(
      IANAZone.create(timezone),
    );

    // #1. do not meet the condition
    let triggers: AutomationTrigger[] = [];
    let trigger: AutomationTrigger = {
      _id: new Types.ObjectId(),
      id: 'trigger1',
      deviceType: DeviceType.LAMP,
      devices: [device01, device02],
      logic: Logic.AND,
      conditions: [
        {
          sensorId: 'status',
          operator: TriggerOperator.EQUAL,
          value: 'ok',
        },
        {
          sensorId: 'setBrightnessPercent',
          operator: TriggerOperator.GREATER,
          value: '10',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    triggers.push(trigger);

    let checkCondition = await processor.checkCondition(
      'rule01',
      now,
      triggers,
      Logic.AND,
    );
    expect(checkCondition.isTrigger).toBe(false);

    // #2. meet the condition
    triggers = [];
    trigger = {
      _id: new Types.ObjectId(),
      id: 'trigger1',
      deviceType: DeviceType.LAMP,
      devices: [device01],
      logic: Logic.AND,
      conditions: [
        {
          sensorId: 'status',
          operator: TriggerOperator.IS_ONE_OF,
          value: 'available,ok,done,health',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    const trigger2 = {
      _id: new Types.ObjectId(),
      id: 'trigger2',
      deviceType: DeviceType.LAMP,
      devices: [device02],
      logic: Logic.AND,
      conditions: [
        {
          sensorId: 'status',
          operator: TriggerOperator.CONTAIN,
          value: 'ala',
        },
        {
          sensorId: 'status',
          operator: TriggerOperator.EQUAL,
          value: 'alarm',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    triggers.push(trigger);
    triggers.push(trigger2);

    checkCondition = await processor.checkCondition(
      'rule01',
      now,
      triggers,
      Logic.AND,
    );
    expect(checkCondition.isTrigger).toBe(true);
    expect(
      checkCondition.triggeredExpression.find((it) => it.lang === 'en-US')
        .message,
    ).toBe(
      '(lamp01 status is one of available,ok,done,health ) AND (lamp02 status contains ala  AND lamp02 status = alarm )',
    );
    expect(
      checkCondition.triggeredCurrentValue.find((it) => it.lang === 'en-US')
        .message,
    ).toBe(
      'lamp01 status = available , lamp02 status = alarm , lamp02 status = alarm ',
    );
  });

  it('should check condition correctly when the data is switch', async () => {
    expect(processor).toBeDefined();

    const timezone = 'Asia/Taipei';
    const now = DateTime.fromISO('2022-04-06T22:15:00.000Z').setZone(
      IANAZone.create(timezone),
    );

    // #1. do not meet the condition
    let triggers: AutomationTrigger[] = [];
    let trigger: AutomationTrigger = {
      _id: new Types.ObjectId(),
      id: 'trigger1',
      deviceType: DeviceType.LAMP,
      devices: [device01],
      logic: Logic.AND,
      conditions: [
        {
          sensorId: 'isHealth',
          operator: TriggerOperator.EQUAL,
          value: 'FALSE',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    triggers.push(trigger);

    let checkCondition = await processor.checkCondition(
      'rule01',
      now,
      triggers,
      Logic.AND,
    );
    expect(checkCondition.isTrigger).toBe(false);

    // #2. meet the condition
    triggers = [];
    trigger = {
      _id: new Types.ObjectId(),
      id: 'trigger1',
      deviceType: DeviceType.LAMP,
      devices: [device01],
      logic: Logic.AND,
      conditions: [
        {
          sensorId: 'isHealth',
          operator: TriggerOperator.EQUAL,
          value: 'TRUE',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    const trigger2 = {
      _id: new Types.ObjectId(),
      id: 'trigger2',
      deviceType: DeviceType.LAMP,
      devices: [device02],
      logic: Logic.OR,
      conditions: [
        {
          sensorId: 'isHealth',
          operator: TriggerOperator.NOT_EQUAL,
          value: 'TRUE',
        },
        {
          sensorId: 'setBrightnessPercent',
          operator: TriggerOperator.GREATER,
          value: '100',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    triggers.push(trigger);
    triggers.push(trigger2);

    checkCondition = await processor.checkCondition(
      'rule01',
      now,
      triggers,
      Logic.AND,
    );
    expect(checkCondition.isTrigger).toBe(true);
    expect(
      checkCondition.triggeredExpression.find((it) => it.lang === 'en-US')
        .message,
    ).toBe('(lamp01 isHealth = TRUE ) AND (lamp02 isHealth ≠ TRUE )');
    expect(
      checkCondition.triggeredCurrentValue.find((it) => it.lang === 'en-US')
        .message,
    ).toBe('lamp01 isHealth = TRUE , lamp02 isHealth = FALSE ');
  });

  it('should check condition correctly when the data is snapshot', async () => {
    expect(processor).toBeDefined();

    const timezone = 'Asia/Bangkok'; // UTC+7
    let now = DateTime.fromISO('2022-04-06T22:15:00.000Z').setZone(
      IANAZone.create(timezone),
    );

    // #1. do not meet the condition
    let triggers: AutomationTrigger[] = [];
    let trigger: AutomationTrigger = {
      _id: new Types.ObjectId(),
      id: 'trigger1',
      deviceType: DeviceType.LAMP,
      devices: [device01, device02],
      logic: Logic.AND,
      conditions: [
        {
          sensorId: 'image',
          operator: TriggerOperator.UPDATED,
          value: '10',
        },
        {
          sensorId: 'setBrightnessPercent',
          operator: TriggerOperator.GREATER,
          value: '10',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    triggers.push(trigger);

    let checkCondition = await processor.checkCondition(
      'rule01',
      now,
      triggers,
      Logic.AND,
    );
    expect(checkCondition.isTrigger).toBe(false);

    // #2. meet the condition
    now = DateTime.fromISO('2022-04-06T22:05:00.000Z').setZone(
      IANAZone.create(timezone),
    );
    triggers = [];
    trigger = {
      _id: new Types.ObjectId(),
      id: 'trigger1',
      deviceType: DeviceType.LAMP,
      devices: [device01, device02],
      logic: Logic.AND,
      conditions: [
        {
          sensorId: 'image',
          operator: TriggerOperator.UPDATED,
          value: '10',
        },
      ],
      toApolloAutomationTrigger: null,
    };
    triggers.push(trigger);

    checkCondition = await processor.checkCondition(
      'rule01',
      now,
      triggers,
      Logic.AND,
    );
    expect(checkCondition.isTrigger).toBe(true);
    expect(
      checkCondition.triggeredExpression.find((it) => it.lang === 'en-US')
        .message,
    ).toBe('(lamp01 image is updated in 10 seconds)');
    expect(
      checkCondition.triggeredCurrentValue.find((it) => it.lang === 'en-US')
        .message,
    ).toBe('lamp01 image is updated at 2022-04-07T05:04:55.000+07:00');
  });
});
