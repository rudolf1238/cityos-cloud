import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import {
  OnQueueActive,
  OnQueueCompleted,
  OnQueueFailed,
  Process,
  Processor,
} from '@nestjs/bull';
import { Job } from 'bull';
import { Constants } from 'src/constants';
import { EffectiveTime, RuleAutomation } from 'src/models/rule.automation';
import { DateTime, IANAZone } from 'luxon';
import {
  ActionType,
  EffectiveDate,
  GaugeSensorData,
  Language,
  Logic,
  SensorType,
  SnapshotSensorData,
  SwitchSensorData,
  TextSensorData,
  TriggerOperator,
  UserStatus,
} from 'src/graphql.schema';
import { AutomationTrigger, Condition } from 'src/models/automation.trigger';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import { Device } from 'src/models/device';
import StringUtils from 'src/utils/StringUtils';
import { DeviceAction, NotifyAction } from 'src/models/automation.action';
import { AutomationService } from './automation.service';
import { LineClient } from '../line/line.client';
import axios from 'axios';
import { MailService } from '../mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { DeviceService } from '../device/device.service';
import { I18nService } from 'nestjs-i18n';
import { RuleAuditLog, RuleAuditLogDocument } from 'src/models/rule.audit.log';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

interface ConditionResult {
  isTrigger: boolean;
  subscriptionLink?: string;
  triggeredTime?: DateTime;
  triggeredExpression?: Array<{
    lang: string;
    message: string;
  }>;
  triggeredCurrentValue?: Array<{
    lang: string;
    message: string;
  }>;
  attachImages?: AttachImage[];
}

interface ConditionMeet {
  pass: boolean;
  currentValue: string;
  attachImage?: AttachImage;
}

interface AttachImage {
  projectKey: string;
  imageUrl: string;
}

@Processor('automation')
@Injectable()
export class AutomationProcessor {
  constructor(
    private chtiotClientService: ChtiotClientService,
    private automationService: AutomationService,
    private lineClient: LineClient,
    private mailService: MailService,
    private configService: ConfigService,
    private readonly deviceService: DeviceService,
    private readonly i18nService: I18nService,
    @InjectModel(RuleAuditLog.name)
    private readonly logModel: Model<RuleAuditLogDocument>,
  ) {}

  private readonly logger = new Logger(AutomationProcessor.name);

  @Process(Constants.BULL_TASK_PROCESS_RULE)
  async processRule(job: Job<string>) {
    this.logger.log(
      `[${Constants.BULL_TASK_PROCESS_RULE}] ruleId = ${job.data}`,
    );
    const rule = await this.automationService.getRuleById(job.data);

    // using the same time for this processing
    const timezone = rule.effectiveAt.timezone;
    const now = DateTime.now().setZone(IANAZone.create(timezone));

    // check the effective for the rule
    const isEffective = this.isEffectiveRule(now, rule);
    this.logger.debug(`${rule.name} isEffective? ${String(isEffective)}`);
    if (!isEffective) {
      return;
    }

    // check the conditions for the rule
    const conditionResult = await this.checkCondition(
      rule.id,
      now,
      rule.if,
      rule.logic,
    );
    if (!conditionResult.isTrigger) {
      this.logger.debug(
        `${rule.name} cannot be triggered due to some conditions not meet`,
      );
      return;
    }

    this.logger.debug(
      `${rule.name} pass the condition!! result = ${JSON.stringify(
        conditionResult,
      )}`,
    );

    const notifyActionLogs: NotifyAction[] = [];
    const deviceActionLogs: DeviceAction[] = [];

    // check the actions (NotifyAction or DeviceAction)
    for (const action of rule.then) {
      switch (action.actionType) {
        case ActionType.DEVICE: {
          // update other device's sensor value
          const deviceAction = action as DeviceAction;
          await this.updateSensorValue(deviceAction);
          deviceActionLogs.push(deviceAction);
          break;
        }
        case ActionType.NOTIFY: {
          // notify users by email and LINE
          const notifyAction = action as NotifyAction;
          await this.notifyUsers(rule.id, notifyAction, conditionResult);
          notifyActionLogs.push(notifyAction);
          break;
        }
      }
    }

    // insert the audit log here
    await this.insertAuditLog(
      rule.id,
      rule.name,
      rule.group.id,
      conditionResult,
      notifyActionLogs,
      deviceActionLogs,
    );
  }

  @OnQueueActive()
  async onActive(job: Job<string>) {
    this.logger.log(`Processing job ${job.id} with ${job.name} ...`);
  }

  @OnQueueFailed()
  async onFailed(job: Job<string>, err: Error) {
    this.logger.error(
      `Failed job ${job.id} of ${job.name} with error ${err.message}.`,
    );
  }

  @OnQueueCompleted()
  OnCompleted(job: Job, _result: any) {
    this.logger.log(`Complete job ${job.id} of ${job.name}.`);
  }

  private isEffectiveRule(now: DateTime, rule: RuleAutomation): boolean {
    const timezone = rule.effectiveAt.timezone;

    // check for the date
    const isEffectiveDate = this.isEffectiveDate(
      now,
      timezone,
      rule.effectiveAt.effectiveDate,
    );
    if (!isEffectiveDate) {
      this.logger.debug(
        `[effectiveDate] the date is not between the start/end date}`,
      );
      return false;
    }

    // check for the weekday
    const isEffectiveWeekday = this.isEffectiveWeekday(
      now,
      rule.effectiveAt.effectiveWeekday,
    );
    if (!isEffectiveWeekday) {
      this.logger.debug(
        `[effectiveWeekday] the weekday is not between the weekdays}`,
      );
      return false;
    }

    // check for the time
    const isEffectiveTime = this.isEffectiveTime(
      now,
      rule.effectiveAt.effectiveTime,
    );
    if (!isEffectiveTime) {
      this.logger.debug(
        `[effectiveTime] the time is not between the from/to time}`,
      );
      return false;
    }

    return true;
  }

  async checkCondition(
    ruleId: string,
    now: DateTime,
    triggers: AutomationTrigger[],
    logic: Logic,
  ): Promise<ConditionResult> {
    let numberOfPassTriggers = 0;
    const triggeredExpression: Array<{
      lang: string;
      message: string;
    }> = [];
    const triggeredCurrentValue: Array<{
      lang: string;
      message: string;
    }> = [];

    this.i18nService.getSupportedLanguages().map((lang) => {
      triggeredExpression.push({
        lang,
        message: '',
      });
      triggeredCurrentValue.push({
        lang,
        message: '',
      });
    });

    const attachImages = [];

    for (const trigger of triggers) {
      triggeredExpression.forEach((it) => (it.message += '('));
      let numberOfPassDevices = 0;
      // check the conditions for each device
      for (const device of trigger.devices) {
        switch (trigger.logic) {
          // all conditions must be pass when AND
          case Logic.AND: {
            let numberOfPassConditions = 0;
            for (const condition of trigger.conditions) {
              const conditionMeet = await this.isConditionMeet(
                now,
                device,
                condition,
              );
              if (conditionMeet.pass) {
                numberOfPassConditions += 1;
                triggeredExpression.forEach(
                  (it) =>
                    (it.message += `${this.buildTriggeredExpression(
                      it.lang,
                      device,
                      condition,
                    )} AND `),
                );
                triggeredCurrentValue.forEach(
                  (it) =>
                    (it.message += `${this.buildTriggeredCurrentValue(
                      it.lang,
                      device,
                      condition,
                      conditionMeet.currentValue,
                    )}, `),
                );
                if (conditionMeet.attachImage) {
                  attachImages.push(conditionMeet.attachImage);
                }
              }
            }
            if (numberOfPassConditions === trigger.conditions.length) {
              numberOfPassDevices += 1;
            }

            // remove the last ANDs
            triggeredExpression.forEach((it) => {
              it.message = StringUtils.removeStringAfter(
                it.message,
                ' AND',
                false,
              );
            });

            break;
          }
          // any one of condition pass is recognized as pass when OR
          default: {
            for (const condition of trigger.conditions) {
              const conditionMeet = await this.isConditionMeet(
                now,
                device,
                condition,
              );
              if (conditionMeet.pass) {
                triggeredExpression.forEach((it) => {
                  it.message += `${this.buildTriggeredExpression(
                    it.lang,
                    device,
                    condition,
                  )} OR `;
                });
                triggeredCurrentValue.forEach((it) => {
                  it.message += `${this.buildTriggeredCurrentValue(
                    it.lang,
                    device,
                    condition,
                    conditionMeet.currentValue,
                  )}, `;
                });
                numberOfPassDevices += 1;
                if (conditionMeet.attachImage) {
                  attachImages.push(conditionMeet.attachImage);
                }
                break;
              }
            }

            // remove the last OR
            triggeredExpression.forEach((it) => {
              it.message = StringUtils.removeStringAfter(
                it.message,
                ' OR',
                false,
              );
            });
            break;
          }
        }

        // no need to check other devices if anyone of them is pass
        if (numberOfPassDevices > 0) {
          break;
        }
      }

      triggeredExpression.forEach((it) => {
        if (it.message.charAt(it.message.length - 1) === '(') {
          // nothing in the expression, remove "("
          it.message = it.message.substring(0, it.message.length - 1);
        } else {
          // something in the expression, add ")" and "logic"
          it.message += `) ${logic} `;
        }
      });

      // any one of the devices pass, it pass
      if (numberOfPassDevices !== 0) {
        numberOfPassTriggers += 1;
        // no need to check other triggers if the logic is OR
        if (logic === Logic.OR) {
          break;
        }
      } else {
        // if the trigger is failed when AND, no need to check other triggers
        if (logic === Logic.AND) {
          return {
            isTrigger: false,
          };
        }
      }
    }

    // remove the useless sentence in the end
    triggeredExpression.forEach((it) => {
      it.message = StringUtils.removeStringAfter(it.message, ')', true);
    });

    triggeredCurrentValue.forEach((it) => {
      it.message = StringUtils.removeStringAfter(it.message, ',', false);
    });

    if (numberOfPassTriggers === 0) {
      return {
        isTrigger: false,
      };
    } else {
      return {
        isTrigger: true,
        subscriptionLink: `${this.configService.get<string>(
          'CITYOS_WEB_URI',
        )}/subscription-settings/?q=${ruleId}`,
        triggeredTime: now,
        triggeredExpression,
        triggeredCurrentValue,
        attachImages,
      };
    }
  }

  private async isConditionMeet(
    now: DateTime,
    device: Device,
    condition: Condition,
  ): Promise<ConditionMeet> {
    const projectKey = device.groups[0].projectKey;
    const sensor = device.getSensor(condition.sensorId);
    const sensorType = sensor?.type;

    const sensorData = await this.chtiotClientService.sensorValueRaw(
      projectKey,
      device.deviceId,
      sensor.iotSensorId,
      sensorType,
    );

    switch (sensorType) {
      case SensorType.GAUGE: {
        const gauge = sensorData as GaugeSensorData;
        const currentValue = gauge.value;
        switch (condition.operator) {
          case TriggerOperator.GREATER: {
            return {
              pass: currentValue > parseFloat(condition.value),
              currentValue: `${currentValue}`,
            };
          }
          case TriggerOperator.GREATER_OR_EQUAL: {
            return {
              pass: currentValue >= parseFloat(condition.value),
              currentValue: `${currentValue}`,
            };
          }
          case TriggerOperator.LESS: {
            return {
              pass: currentValue < parseFloat(condition.value),
              currentValue: `${currentValue}`,
            };
          }
          case TriggerOperator.LESS_OR_EQUAL: {
            return {
              pass: currentValue <= parseFloat(condition.value),
              currentValue: `${currentValue}`,
            };
          }
          case TriggerOperator.EQUAL: {
            return {
              pass: currentValue === parseFloat(condition.value),
              currentValue: `${currentValue}`,
            };
          }
          case TriggerOperator.NOT_EQUAL: {
            return {
              pass: currentValue !== parseFloat(condition.value),
              currentValue: `${currentValue}`,
            };
          }
          case TriggerOperator.BETWEEN: {
            const between = condition.value
              .split(',')
              .map((it) => parseFloat(it));

            return {
              pass: currentValue >= between[0] && currentValue <= between[1],
              currentValue: `${currentValue}`,
            };
          }
          case TriggerOperator.UPDATED: {
            const updatedInSeconds = parseFloat(condition.value);
            return {
              pass:
                now.diff(DateTime.fromJSDate(gauge.time), 'seconds').toObject()
                  .seconds <= updatedInSeconds,
              currentValue: DateTime.fromJSDate(gauge.time, {
                zone: now.zone,
              }).toISO({
                includeOffset: true,
              }),
            };
          }
        }
      }
      case SensorType.TEXT: {
        const text = sensorData as TextSensorData;
        const currentValue = text.value;
        switch (condition.operator) {
          case TriggerOperator.EQUAL: {
            return {
              pass: currentValue === condition.value,
              currentValue: `${currentValue}`,
            };
          }
          case TriggerOperator.NOT_EQUAL: {
            return {
              pass: currentValue !== condition.value,
              currentValue: `${currentValue}`,
            };
          }
          case TriggerOperator.CONTAIN: {
            return {
              pass: currentValue.includes(condition.value),
              currentValue: `${currentValue}`,
            };
          }
          case TriggerOperator.IS_ONE_OF: {
            const list = condition.value.split(',');
            return {
              pass: list.includes(currentValue),
              currentValue: `${currentValue}`,
            };
          }
          case TriggerOperator.UPDATED: {
            const updatedInSeconds = parseFloat(condition.value);
            return {
              pass:
                now.diff(DateTime.fromJSDate(text.time), 'seconds').toObject()
                  .seconds <= updatedInSeconds,
              currentValue: DateTime.fromJSDate(text.time, {
                zone: now.zone,
              }).toISO({
                includeOffset: true,
              }),
            };
          }
        }
      }
      case SensorType.SWITCH: {
        const sensorSwitch = sensorData as SwitchSensorData;
        const currentValue = sensorSwitch.value;
        const conditionValue = condition.value === 'TRUE' ? true : false;
        switch (condition.operator) {
          case TriggerOperator.EQUAL: {
            return {
              pass: currentValue === conditionValue,
              currentValue: currentValue ? 'TRUE' : 'FALSE',
            };
          }
          case TriggerOperator.NOT_EQUAL: {
            return {
              pass: currentValue !== conditionValue,
              currentValue: currentValue ? 'TRUE' : 'FALSE',
            };
          }
          case TriggerOperator.UPDATED: {
            const updatedInSeconds = parseFloat(condition.value);
            return {
              pass:
                now
                  .diff(DateTime.fromJSDate(sensorSwitch.time), 'seconds')
                  .toObject().seconds <= updatedInSeconds,
              currentValue: DateTime.fromJSDate(sensorSwitch.time, {
                zone: now.zone,
              }).toISO({
                includeOffset: true,
              }),
            };
          }
        }
      }
      case SensorType.SNAPSHOT: {
        const snapshot = sensorData as SnapshotSensorData;
        const updatedInSeconds = parseFloat(condition.value);
        // only UPDATED for snapshot
        return {
          pass:
            now.diff(DateTime.fromJSDate(snapshot.time), 'seconds').toObject()
              .seconds <= updatedInSeconds,
          currentValue: DateTime.fromJSDate(snapshot.time, {
            zone: now.zone,
          }).toISO({
            includeOffset: true,
          }),
          attachImage: {
            projectKey,
            imageUrl: snapshot.value,
          },
        };
      }
      default: {
        return {
          pass: false,
          currentValue: null,
        };
      }
    }
  }

  private buildTriggeredExpression(
    lang: string,
    device: Device,
    condition: Condition,
  ): string {
    switch (condition.operator) {
      case TriggerOperator.GREATER: {
        return this.i18nService.t('automation.triggeredExpression.greater', {
          lang,
          args: {
            deviceName: device.name,
            sensorId: condition.sensorId,
            value: condition.value,
            unit: device.getSensor(condition.sensorId)?.unit || '',
          },
        });
      }
      case TriggerOperator.GREATER_OR_EQUAL: {
        return this.i18nService.t(
          'automation.triggeredExpression.greaterOrEqual',
          {
            lang,
            args: {
              deviceName: device.name,
              sensorId: condition.sensorId,
              value: condition.value,
              unit: device.getSensor(condition.sensorId)?.unit || '',
            },
          },
        );
      }
      case TriggerOperator.LESS: {
        return this.i18nService.t('automation.triggeredExpression.less', {
          lang,
          args: {
            deviceName: device.name,
            sensorId: condition.sensorId,
            value: condition.value,
            unit: device.getSensor(condition.sensorId)?.unit || '',
          },
        });
      }
      case TriggerOperator.LESS_OR_EQUAL: {
        return this.i18nService.t(
          'automation.triggeredExpression.lessOrEqual',
          {
            lang,
            args: {
              deviceName: device.name,
              sensorId: condition.sensorId,
              value: condition.value,
              unit: device.getSensor(condition.sensorId)?.unit || '',
            },
          },
        );
      }
      case TriggerOperator.EQUAL: {
        return this.i18nService.t('automation.triggeredExpression.equal', {
          lang,
          args: {
            deviceName: device.name,
            sensorId: condition.sensorId,
            value: condition.value,
            unit: device.getSensor(condition.sensorId)?.unit || '',
          },
        });
      }
      case TriggerOperator.NOT_EQUAL: {
        return this.i18nService.t('automation.triggeredExpression.notEqual', {
          lang,
          args: {
            deviceName: device.name,
            sensorId: condition.sensorId,
            value: condition.value,
            unit: device.getSensor(condition.sensorId)?.unit || '',
          },
        });
      }
      case TriggerOperator.BETWEEN: {
        const between = condition.value.split(',').map((it) => parseFloat(it));
        return this.i18nService.t('automation.triggeredExpression.between', {
          lang,
          args: {
            deviceName: device.name,
            sensorId: condition.sensorId,
            between0: between[0],
            between1: between[1],
            unit: device.getSensor(condition.sensorId)?.unit || '',
          },
        });
      }
      case TriggerOperator.UPDATED: {
        return this.i18nService.t('automation.triggeredExpression.updated', {
          lang,
          args: {
            deviceName: device.name,
            sensorId: condition.sensorId,
            value: condition.value,
          },
        });
      }
      case TriggerOperator.CONTAIN: {
        return this.i18nService.t('automation.triggeredExpression.contain', {
          lang,
          args: {
            deviceName: device.name,
            sensorId: condition.sensorId,
            value: condition.value,
            unit: device.getSensor(condition.sensorId)?.unit || '',
          },
        });
      }
      case TriggerOperator.IS_ONE_OF: {
        return this.i18nService.t('automation.triggeredExpression.isOneOf', {
          lang,
          args: {
            deviceName: device.name,
            sensorId: condition.sensorId,
            value: condition.value,
            unit: device.getSensor(condition.sensorId)?.unit || '',
          },
        });
      }
      default: {
        throw new NotImplementedException(
          `${JSON.stringify(
            condition,
          )} is not implemented for buildTriggeredExpression.`,
        );
      }
    }
  }

  private buildTriggeredCurrentValue(
    lang: string,
    device: Device,
    condition: Condition,
    value: string,
  ): string {
    if (condition.operator === TriggerOperator.UPDATED) {
      return this.i18nService.t('automation.triggeredCurrentValue.updated', {
        lang,
        args: {
          deviceName: device.name,
          sensorId: condition.sensorId,
          value,
        },
      });
    } else {
      return this.i18nService.t('automation.triggeredCurrentValue.default', {
        lang,
        args: {
          deviceName: device.name,
          sensorId: condition.sensorId,
          value,
          unit: device.getSensor(condition.sensorId)?.unit || '',
        },
      });
    }
  }

  isEffectiveDate(
    now: DateTime,
    timezone: string,
    effectiveDate: EffectiveDate,
  ): boolean {
    const startDate = DateTime.fromFormat(
      `${effectiveDate.startMonth
        .toString()
        .padStart(2, '0')}${effectiveDate.startDay
        .toString()
        .padStart(2, '0')}`,
      'Md',
      {
        setZone: true,
        zone: IANAZone.create(timezone),
      },
    );

    const endDate = DateTime.fromFormat(
      `${effectiveDate.endMonth
        .toString()
        .padStart(2, '0')}${effectiveDate.endDay.toString().padStart(2, '0')}`,
      'Md',
      {
        setZone: true,
        zone: IANAZone.create(timezone),
      },
    );

    this.logger.debug(
      `startDate = ${startDate.toISODate()}, endDate = ${endDate.toISODate()}`,
    );

    if (startDate.ordinal <= endDate.ordinal) {
      // check when the start/end in the same year
      if (now.ordinal >= startDate.ordinal && now.ordinal <= endDate.ordinal) {
        // ok
        return true;
      } else {
        return false;
      }
    } else {
      // check when the start/end date across the year
      if (now.ordinal > endDate.ordinal && now.ordinal < startDate.ordinal) {
        return false;
      } else {
        // ok
        return true;
      }
    }
  }

  isEffectiveWeekday(now: DateTime, effectiveWeekday: number[]): boolean {
    return effectiveWeekday.includes(now.weekday);
  }

  isEffectiveTime(now: DateTime, effectiveTime: EffectiveTime): boolean {
    let fromTime = now;
    fromTime = fromTime.set({
      hour: effectiveTime.fromHour,
      minute: effectiveTime.fromMinute,
      second: 0,
    });

    let toTime = now;
    toTime = toTime.set({
      hour: effectiveTime.toHour,
      minute: effectiveTime.toMinute,
      second: 59,
    });

    this.logger.debug(
      `now = ${now.toISO()}, fromTime = ${fromTime.toISO()}, toTime = ${toTime.toISO()}`,
    );

    if (fromTime <= toTime) {
      // check when the from/to in the same day
      if (now >= fromTime && now <= toTime) {
        // ok
        return true;
      } else {
        return false;
      }
    } else {
      // check when the from/to across the day
      if (now > toTime && now < fromTime) {
        return false;
      } else {
        // ok
        return true;
      }
    }
  }

  private async notifyUsers(
    ruleId: string,
    notifyAction: NotifyAction,
    conditionResult: ConditionResult,
  ) {
    // handling for images
    let base64Images: string[] = [];
    if (notifyAction.snapshot && conditionResult.attachImages) {
      base64Images = await this.downloadImages(conditionResult.attachImages);
    }

    const users = notifyAction.users.filter(
      (it) => it.status === UserStatus.ACTIVE,
    );
    for (const user of users) {
      const message = this.buildMessageForLanguage(
        user.language,
        notifyAction.message,
        conditionResult,
      );

      const subscription = await this.automationService.getSubscription(
        ruleId,
        user,
      );
      if (subscription.byLine) {
        const messageWithLink = message.concat(
          `\n\n${conditionResult.subscriptionLink}`,
        );
        await this.lineClient.sendMessageByNotify(
          user,
          messageWithLink,
          base64Images,
        );
      }
      if (subscription.byMail) {
        await this.mailService.sendAutomationNotifyMail(
          user,
          message,
          conditionResult.subscriptionLink,
          base64Images,
        );
      }
    }
  }

  private async updateSensorValue(deviceAction: DeviceAction) {
    await Promise.all(
      deviceAction.devices.map(async (d) => {
        const projectKey = await this.deviceService.getProjectKeyById(
          d.deviceId,
        );
        return this.chtiotClientService.updateSensor(
          projectKey,
          d.deviceId,
          deviceAction.sensorId,
          deviceAction.setValue,
        );
      }),
    );
  }

  private async downloadImages(attachImages: AttachImage[]): Promise<string[]> {
    return Promise.all(
      attachImages.map(async (it) => {
        const response = await axios.get<string>(it.imageUrl, {
          headers: {
            'Content-Type': 'image/jpeg',
            CK: it.projectKey,
          },
          responseType: 'arraybuffer',
        });
        return Buffer.from(response.data, 'binary').toString('base64');
      }),
    );
  }

  private buildMessageForLanguage(
    language: Language,
    message: string,
    conditionResult: ConditionResult,
  ): string {
    // the format for language is en_US, but format for i18n is en-US
    const i18nLanguage = StringUtils.convertToI18nFormat(language);
    let triggeredExpression = conditionResult.triggeredExpression.find(
      (it) => it.lang === i18nLanguage,
    );
    if (!triggeredExpression) {
      triggeredExpression = conditionResult.triggeredExpression.find(
        (it) => it.lang === 'en-US',
      );
    }

    const triggeredCurrentValue = conditionResult.triggeredCurrentValue.find(
      (it) => it.lang === i18nLanguage,
    );
    if (!triggeredCurrentValue) {
      triggeredExpression = conditionResult.triggeredCurrentValue.find(
        (it) => it.lang === 'en-US',
      );
    }

    return this.i18nService
      .t<string>('automation.messagePrefix', { lang: i18nLanguage })
      .concat(message)
      .replace(
        /%TRIGGERED_TIME%/g,
        conditionResult.triggeredTime.toISO({ includeOffset: true }),
      )
      .replace(/%TRIGGERED_EXPRESSION%/g, triggeredExpression.message)
      .replace(/%TRIGGERED_CURRENT_VALUE%/g, triggeredCurrentValue.message)
      .replace(/\\n/g, '\n');
  }

  private async insertAuditLog(
    ruleId: string,
    ruleName: string,
    groupId: string,
    conditionResult: ConditionResult,
    notifyActions: NotifyAction[],
    deviceActions: DeviceAction[],
  ) {
    const triggeredExpression = conditionResult.triggeredExpression.find(
      (it) => (it.lang = StringUtils.convertToI18nFormat(Language.en_US)),
    ).message;
    const triggeredCurrentValue = conditionResult.triggeredCurrentValue.find(
      (it) => (it.lang = StringUtils.convertToI18nFormat(Language.en_US)),
    ).message;
    await this.logModel.create({
      ruleId: new Types.ObjectId(ruleId),
      ruleName,
      group: new Types.ObjectId(groupId),
      triggeredTime: conditionResult.triggeredTime.toJSDate(),
      triggeredExpression,
      triggeredCurrentValue,
      notifyActions,
      deviceActions,
    });
  }
}
