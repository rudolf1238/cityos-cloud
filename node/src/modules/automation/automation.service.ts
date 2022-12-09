import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { ApolloError } from 'apollo-server-express';
import { Queue } from 'bull';
import { DateTime, IANAZone } from 'luxon';
import { Model, Types } from 'mongoose';
import { connect, MqttClient } from 'mqtt';
import { Constants } from 'src/constants';
import {
  Action,
  ActionType,
  AuditLogConnection,
  AuditLogEdge,
  AuditLogFilter,
  AuditLogSortField,
  AutomationTriggerInput,
  CreateRuleInput,
  DeviceActionInput,
  EditRuleInput,
  EffectiveAtInput,
  Logic,
  MapDeviceFilter,
  NotifyActionInput,
  PageInfo,
  RuleConnection,
  RuleEdge,
  RuleFilter,
  RuleSortField,
  SortOrder,
  Subject,
  SubscriptionConnection,
  SubscriptionEdge,
  SubscriptionFilter,
  SubscriptionSortField,
  TriggerOperator,
} from 'src/graphql.schema';
import {
  AutomationAction,
  DeviceAction,
  DeviceActionDocument,
  NotifyAction,
  NotifyActionDocument,
} from 'src/models/automation.action';
import {
  AutomationTrigger,
  AutomationTriggerDocument,
} from 'src/models/automation.trigger';
import { ErrorCode } from 'src/models/error.code';
import { RuleAuditLog, RuleAuditLogDocument } from 'src/models/rule.audit.log';
import {
  EffectiveAt,
  RuleAutomation,
  RuleAutomationDocument,
} from 'src/models/rule.automation';
import {
  RuleSubscription,
  RuleSubscriptionDocument,
} from 'src/models/rule.subscription';
import { User } from 'src/models/user';
import MQTTHelper from 'src/utils/MQTTHelper';
import StringUtils from 'src/utils/StringUtils';
import { DeviceService } from '../device/device.service';
import { GroupService } from '../group/group.service';
import { MqttSensorResponse } from '../sensor/sensor.service';
import { UserService } from '../user/user.service';

interface MQTTClientOption {
  username: string;
  password: string;
  topics: Array<{
    topic: string;
    count: number;
  }>;
  client?: MqttClient;
}

interface CheckRuleInputResponse {
  isValid: boolean;
  errorCode?: ErrorCode;
  reason?: string;
}

@Injectable()
export class AutomationService implements OnModuleInit {
  private mqttClientOptions: MQTTClientOption[] = [];

  constructor(
    @InjectModel(RuleAutomation.name)
    private readonly ruleModel: Model<RuleAutomationDocument>,
    @InjectModel(AutomationTrigger.name)
    private readonly triggerModel: Model<AutomationTriggerDocument>,
    @InjectModel(NotifyAction.name)
    private readonly actionNotifyModel: Model<NotifyActionDocument>,
    @InjectModel(DeviceAction.name)
    private readonly actionDeviceModel: Model<DeviceActionDocument>,
    @InjectModel(RuleSubscription.name)
    private readonly subscriptionModel: Model<RuleSubscriptionDocument>,
    @InjectModel(RuleAuditLog.name)
    private readonly logModel: Model<RuleAuditLogDocument>,
    private readonly deviceService: DeviceService,
    private readonly userService: UserService,
    private readonly groupService: GroupService,
    private readonly configService: ConfigService,
    @InjectQueue('automation') private automationQueue: Queue,
  ) {}

  private readonly logger = new Logger(AutomationService.name);

  async onModuleInit() {
    // find projectKey, deviceId, sensorId from all triggers
    const allTriggers = await this.triggerModel.find();
    for (const trigger of allTriggers) {
      for (const device of trigger.devices) {
        const projectKey = await this.deviceService.getProjectKeyById(
          device.deviceId,
        );
        for (const condition of trigger.conditions) {
          const sensor = device.getSensor(condition.sensorId);
          if (sensor)
            this.addMqttTopic(projectKey, device.deviceId, sensor.iotSensorId);
        }
      }
    }

    // subscribe the MQTT
    for (const mqttClientOption of this.mqttClientOptions) {
      const client = connect(
        this.configService.get<string>('CHTIOT_MQTT_URI'),
        mqttClientOption,
      );

      this.logger.log(`Subscribe to MQTT for ${mqttClientOption.username}`);
      const topics = mqttClientOption.topics.map((it) => it.topic);
      MQTTHelper.subscribeMultipleTopics(client, topics);

      client.on('message', (_mqttTopic, message) => {
        void (async () => {
          const mqttResponse = JSON.parse(
            message.toString(),
          ) as MqttSensorResponse;
          const response = new Date(mqttResponse.time);
          const device = await this.deviceService.getDeviceById(
            mqttResponse.deviceId,
          );
          const sensor = device.sensors.find(
            (it) => it.iotSensorId === mqttResponse.id,
          );

          // skip check the obsolete data due to MQTT will callback the latest records initially
          if (
            new Date().getTime() - response.getTime() >
            Constants.CHECK_AUTOMATION_IF_DATA_IN_SECONDS * 1000
          ) {
            return;
          }

          this.logger.debug(
            `[GetMQTT/Automation]: ${JSON.stringify(mqttResponse)}`,
          );

          // find out the triggerId and ruleId, and send the ruleId to the Bull
          const triggers = await this.triggerModel.aggregate<AutomationTrigger>(
            [
              {
                $lookup: {
                  from: 'devices',
                  localField: 'devices',
                  foreignField: '_id',
                  as: 'devices',
                },
              },
              {
                $match: {
                  $and: [
                    {
                      'devices.deviceId': mqttResponse.deviceId,
                    },
                    {
                      'conditions.sensorId': sensor.sensorId,
                    },
                  ],
                },
              },
            ],
          );

          const rules = await this.ruleModel.find({
            if: {
              $in: triggers.map((it) => it._id),
            },
          });

          // send the rules to the bull (queue)
          await Promise.all(
            rules.map(async (rule) => {
              return this.automationQueue.add(
                Constants.BULL_TASK_PROCESS_RULE,
                rule.id,
              );
            }),
          );
        })();
      });

      mqttClientOption.client = client;
    }
  }

  async searchRules(
    groupId: string,
    filter?: RuleFilter,
    size?: number,
    after?: string,
    before?: string,
  ): Promise<RuleConnection> {
    // Build up the query for filter
    const sortField = filter?.sortField ? filter.sortField : RuleSortField.ID;
    const sortOrder = filter?.sortOrder
      ? filter.sortOrder
      : SortOrder.ASCENDING;

    const filterCondition = {
      $and: [
        {
          group: new Types.ObjectId(groupId),
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        ...(await this.filterForSearchRules(groupId, filter?.keyword)),
      ],
    };

    const edges = await this.mongoQueryForRules(
      size,
      filterCondition,
      sortField,
      sortOrder,
      before ? true : false,
      after || before,
    );

    // Save the rules into the connection
    const ruleConnection = new RuleConnection();
    ruleConnection.edges = [];
    const pageInfo = new PageInfo();

    let index = 0;
    for (const edge of edges) {
      index += 1;
      if (index < size + 1) {
        ruleConnection.edges.push(edge);
      }
    }

    if (before) {
      ruleConnection.edges.reverse();

      pageInfo.hasPreviousPage = edges.length === size + 1;
      pageInfo.beforeCursor = ruleConnection.edges[0]?.cursor;

      pageInfo.endCursor =
        ruleConnection.edges[ruleConnection.edges.length - 1]?.cursor;
      if (pageInfo.endCursor) {
        const more = await this.mongoQueryForRules(
          size,
          filterCondition,
          sortField,
          sortOrder,
          false,
          pageInfo.endCursor,
        );
        pageInfo.hasNextPage = more.length > 0;
      } else {
        pageInfo.hasNextPage = false;
      }
    } else {
      pageInfo.hasNextPage = edges.length === size + 1;
      pageInfo.endCursor =
        ruleConnection.edges[ruleConnection.edges.length - 1]?.cursor;

      pageInfo.beforeCursor = ruleConnection.edges[0]?.cursor;
      if (pageInfo.beforeCursor) {
        const more = await this.mongoQueryForRules(
          size,
          filterCondition,
          sortField,
          sortOrder,
          true,
          pageInfo.beforeCursor,
        );

        pageInfo.hasPreviousPage = more.length > 0;
      } else {
        pageInfo.hasPreviousPage = false;
      }
    }

    ruleConnection.pageInfo = pageInfo;
    ruleConnection.totalCount = await this.ruleModel
      .find(filterCondition, null, { strictQuery: false })
      .countDocuments();

    return ruleConnection;
  }

  async createRule(createRuleInput: CreateRuleInput): Promise<RuleAutomation> {
    // check
    const checkInputResponse = await this.isValidBuildRuleInput(
      createRuleInput.groupId,
      createRuleInput.name,
      undefined,
      createRuleInput.effectiveAtInput,
      createRuleInput.logic,
      createRuleInput.if,
      createRuleInput.thenDevice,
      createRuleInput.thenNotify,
    );
    if (!checkInputResponse.isValid) {
      throw new ApolloError(
        `The input you provided is not correct. (${checkInputResponse.reason})`,
        checkInputResponse.errorCode,
      );
    }

    // create the AutomationTrigger in the db
    const triggers = await this.createAutomationTriggers(createRuleInput.if);

    // create the DeviceAction in the db (if any)
    const deviceActions = await this.createDeviceActions(
      createRuleInput.thenDevice,
    );

    // create the NotifyAction in the db (if any)
    const notifyActions = await this.createNotifyActions(
      createRuleInput.thenNotify,
    );

    // create the RuleAutomation in the db
    const effectiveAt: EffectiveAt = {
      timezone: createRuleInput.effectiveAtInput.timezone,
      effectiveDate: createRuleInput.effectiveAtInput.effectiveDate,
      effectiveWeekday: createRuleInput.effectiveAtInput.effectiveWeekday,
      effectiveTime: createRuleInput.effectiveAtInput.effectiveTime,
    };
    const ruleAutomation = await this.ruleModel.create({
      name: createRuleInput.name,
      group: await this.groupService.getGroup(createRuleInput.groupId),
      effectiveAt,
      logic: createRuleInput.logic,
      if: triggers,
      then: (deviceActions as AutomationAction[]).concat(notifyActions),
    });

    // create the RuleSubscription in the db (if any notifyActions)
    await this.createRuleSubscription(ruleAutomation, notifyActions);

    return ruleAutomation;
  }

  async deleteRule(rule: RuleAutomation): Promise<boolean> {
    // delete the AutomationTrigger from the db
    await Promise.all(
      rule.if.map(async (trigger) => {
        // unsubscribe the MQTT here
        for (const device of trigger.devices) {
          const projectKey = device.groups[0].projectKey;
          for (const condition of trigger.conditions) {
            const sensor = device.getSensor(condition.sensorId);
            if (sensor)
              this.deleteMqttTopic(
                projectKey,
                device.deviceId,
                sensor.iotSensorId,
              );
          }
        }

        return this.triggerModel.findByIdAndDelete(trigger.id);
      }),
    );

    // delete the DeviceAction and NotifyAction from the db
    await Promise.all(
      rule.then.map(async (action) => {
        switch (action.actionType) {
          case ActionType.DEVICE: {
            return this.actionDeviceModel.findByIdAndDelete(action.id);
          }
          case ActionType.NOTIFY: {
            return this.actionNotifyModel.findByIdAndDelete(action.id);
          }
        }
      }),
    );

    // delete the RuleSubscription from the db
    await this.subscriptionModel.deleteMany({
      rule: rule._id,
    });

    // delete the RuleAutomation from the db
    return !!(await this.ruleModel.findByIdAndDelete(rule.id));
  }

  async editRule(
    rule: RuleAutomation,
    editRuleInput: EditRuleInput,
  ): Promise<RuleAutomation> {
    // check
    const checkInputResponse = await this.isValidBuildRuleInput(
      rule.group.id,
      editRuleInput.name,
      rule.id,
      editRuleInput.effectiveAtInput,
      editRuleInput.logic,
      editRuleInput.if,
      editRuleInput.thenDevice,
      editRuleInput.thenNotify,
    );
    if (!checkInputResponse.isValid) {
      throw new ApolloError(
        `The input you provided is not correct. (${checkInputResponse.reason})`,
        checkInputResponse.errorCode,
      );
    }

    // edit the basic information
    rule.name = editRuleInput.name || rule.name;
    rule.logic = editRuleInput.logic || rule.logic;

    // edit the effectiveAt
    if (editRuleInput.effectiveAtInput) {
      const effectiveAt: EffectiveAt = {
        timezone: editRuleInput.effectiveAtInput.timezone,
        effectiveDate: editRuleInput.effectiveAtInput.effectiveDate,
        effectiveWeekday: editRuleInput.effectiveAtInput.effectiveWeekday,
        effectiveTime: editRuleInput.effectiveAtInput.effectiveTime,
      };
      rule.effectiveAt = effectiveAt;
    }

    // edit the effectiveAt
    if (editRuleInput.if) {
      // delete first
      await Promise.all(
        rule.if.map(async (trigger) => {
          // unsubscribe the MQTT here
          for (const device of trigger.devices) {
            const projectKey = device.groups[0].projectKey;
            for (const condition of trigger.conditions) {
              const sensor = device.getSensor(condition.sensorId);
              if (sensor)
                this.deleteMqttTopic(
                  projectKey,
                  device.deviceId,
                  sensor.iotSensorId,
                );
            }
          }

          return this.triggerModel.findByIdAndDelete(trigger.id);
        }),
      );

      // create the AutomationTrigger in the db
      const triggers = await this.createAutomationTriggers(editRuleInput.if);
      rule.if = triggers;
    }

    // edit the DeviceAction and NotifyAction
    if (editRuleInput.thenDevice || editRuleInput.thenNotify) {
      // delete first
      await Promise.all(
        rule.then.map(async (action) => {
          switch (action.actionType) {
            case ActionType.DEVICE: {
              return this.actionDeviceModel.findByIdAndDelete(action.id);
            }
            case ActionType.NOTIFY: {
              return this.actionNotifyModel.findByIdAndDelete(action.id);
            }
          }
        }),
      );

      // create the DeviceAction in the db (if any)
      const deviceActions = await this.createDeviceActions(
        editRuleInput.thenDevice,
      );

      // create the NotifyAction in the db (if any)
      const notifyActions = await this.createNotifyActions(
        editRuleInput.thenNotify,
      );

      rule.then = (deviceActions as AutomationAction[]).concat(notifyActions);

      // edit the RuleSubscription: create it
      await this.createRuleSubscription(rule, notifyActions);
    }

    await this.ruleModel.updateOne({ _id: rule._id }, rule);
    return this.getRuleById(rule.id);
  }

  async getRuleById(ruleId: string): Promise<RuleAutomation> {
    return this.ruleModel.findById(ruleId);
  }

  async editMySubscription(
    user: User,
    ruleId: string,
    byLine: boolean,
    byMail: boolean,
  ): Promise<RuleSubscription> {
    try {
      return await this.subscriptionModel.findOneAndUpdate(
        {
          user: user._id,
          rule: new Types.ObjectId(ruleId),
        },
        {
          byLine,
          byMail,
        },
        {
          new: true,
        },
      );
    } catch {
      return null;
    }
  }

  async searchMySubscriptions(
    user: User,
    filter?: SubscriptionFilter,
    size?: number,
    after?: string,
    before?: string,
  ): Promise<SubscriptionConnection> {
    // Build up the query for filter
    const sortField = filter?.sortField
      ? filter.sortField
      : SubscriptionSortField.ID;
    const sortOrder = filter?.sortOrder
      ? filter.sortOrder
      : SortOrder.ASCENDING;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const filterCondition = await this.filterForSearchSubscriptions(
      user,
      filter?.keyword,
    );

    const edges = await this.mongoQueryForSubscriptions(
      user,
      size,
      filterCondition,
      sortField,
      sortOrder,
      before ? true : false,
      after || before,
    );

    // Save the rules into the connection
    const subscriptionConnection = new SubscriptionConnection();
    subscriptionConnection.edges = [];
    const pageInfo = new PageInfo();

    let index = 0;
    for (const edge of edges) {
      index += 1;
      if (index < size + 1) {
        subscriptionConnection.edges.push(edge);
      }
    }

    if (before) {
      subscriptionConnection.edges.reverse();

      pageInfo.hasPreviousPage = edges.length === size + 1;
      pageInfo.beforeCursor = subscriptionConnection.edges[0]?.cursor;

      pageInfo.endCursor =
        subscriptionConnection.edges[
          subscriptionConnection.edges.length - 1
        ]?.cursor;
      if (pageInfo.endCursor) {
        const more = await this.mongoQueryForSubscriptions(
          user,
          size,
          filterCondition,
          sortField,
          sortOrder,
          false,
          pageInfo.endCursor,
        );
        pageInfo.hasNextPage = more.length > 0;
      } else {
        pageInfo.hasNextPage = false;
      }
    } else {
      pageInfo.hasNextPage = edges.length === size + 1;
      pageInfo.endCursor =
        subscriptionConnection.edges[
          subscriptionConnection.edges.length - 1
        ]?.cursor;

      pageInfo.beforeCursor = subscriptionConnection.edges[0]?.cursor;
      if (pageInfo.beforeCursor) {
        const more = await this.mongoQueryForSubscriptions(
          user,
          size,
          filterCondition,
          sortField,
          sortOrder,
          true,
          pageInfo.beforeCursor,
        );

        pageInfo.hasPreviousPage = more.length > 0;
      } else {
        pageInfo.hasPreviousPage = false;
      }
    }

    const subscriptions =
      await this.subscriptionModel.aggregate<RuleSubscription>([
        {
          $match: {
            user: user._id,
          },
        },
        // rule
        {
          $lookup: {
            from: 'automation_rules',
            localField: 'rule',
            foreignField: '_id',
            as: 'rule',
          },
        },
        { $unwind: '$rule' },
        // rule.group
        {
          $lookup: {
            from: 'groups',
            localField: 'rule.group',
            foreignField: '_id',
            as: 'rule.group',
          },
        },
        { $unwind: '$rule.group' },
        // rule.if
        {
          $lookup: {
            from: 'automation_triggers',
            localField: 'rule.if',
            foreignField: '_id',
            as: 'rule.if',
          },
        },
        {
          $lookup: {
            from: 'devices',
            localField: 'rule.if.devices',
            foreignField: '_id',
            as: 'rule.if.devices',
          },
        },
        // rule.then
        {
          $lookup: {
            from: 'automation_actions',
            localField: 'rule.then',
            foreignField: '_id',
            as: 'rule.then',
          },
        },
        {
          $lookup: {
            from: 'devices',
            localField: 'rule.then.devices',
            foreignField: '_id',
            as: 'rule.then.devices',
          },
        },
        // filter by keyword
        {
          $match: {
            $and: [filterCondition],
          },
        },
      ]);
    subscriptionConnection.totalCount = subscriptions.length;
    subscriptionConnection.pageInfo = pageInfo;

    return subscriptionConnection;
  }

  async getSubscription(ruleId: string, user: User): Promise<RuleSubscription> {
    return this.subscriptionModel.findOne({
      user: new Types.ObjectId(user._id as unknown as string),
      rule: new Types.ObjectId(ruleId),
    });
  }

  async searchAuditLogs(
    user: User,
    filter?: AuditLogFilter,
    size?: number,
    after?: string,
    before?: string,
  ): Promise<AuditLogConnection> {
    // Build up the query for filter
    const sortField = filter?.sortField
      ? filter.sortField
      : AuditLogSortField.TIME;
    const sortOrder = filter?.sortOrder
      ? filter.sortOrder
      : SortOrder.DESCENDING;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const filterCondition = await this.filterForSearchAuditLogs(
      user,
      filter?.keyword,
    );

    const edges = await this.mongoQueryForAuditLogs(
      user,
      size,
      filterCondition,
      sortField,
      sortOrder,
      before ? true : false,
      after || before,
    );

    // Save the rules into the connection
    const auditLogConnection = new AuditLogConnection();
    auditLogConnection.edges = [];
    const pageInfo = new PageInfo();

    let index = 0;
    for (const edge of edges) {
      index += 1;
      if (index < size + 1) {
        auditLogConnection.edges.push(edge);
      }
    }

    if (before) {
      auditLogConnection.edges.reverse();

      pageInfo.hasPreviousPage = edges.length === size + 1;
      pageInfo.beforeCursor = auditLogConnection.edges[0]?.cursor;

      pageInfo.endCursor =
        auditLogConnection.edges[auditLogConnection.edges.length - 1]?.cursor;
      if (pageInfo.endCursor) {
        const more = await this.mongoQueryForAuditLogs(
          user,
          size,
          filterCondition,
          sortField,
          sortOrder,
          false,
          pageInfo.endCursor,
        );
        pageInfo.hasNextPage = more.length > 0;
      } else {
        pageInfo.hasNextPage = false;
      }
    } else {
      pageInfo.hasNextPage = edges.length === size + 1;
      pageInfo.endCursor =
        auditLogConnection.edges[auditLogConnection.edges.length - 1]?.cursor;

      pageInfo.beforeCursor = auditLogConnection.edges[0]?.cursor;
      if (pageInfo.beforeCursor) {
        const more = await this.mongoQueryForAuditLogs(
          user,
          size,
          filterCondition,
          sortField,
          sortOrder,
          true,
          pageInfo.beforeCursor,
        );

        pageInfo.hasPreviousPage = more.length > 0;
      } else {
        pageInfo.hasPreviousPage = false;
      }
    }

    const logs = await this.logModel.aggregate<RuleAuditLog>([
      {
        $match: {
          $or: [
            // notify to the user
            {
              'notifyAction.users': user._id,
            },
            // groups which user has the permission to access
            {
              group: {
                $in: await this.groupsUnderPermission(user),
              },
            },
          ],
        },
      },
      // group
      {
        $lookup: {
          from: 'groups',
          localField: 'group',
          foreignField: '_id',
          as: 'group',
        },
      },
      { $unwind: '$group' },
      // filter by keyword
      {
        $match: {
          $and: [filterCondition],
        },
      },
    ]);
    auditLogConnection.totalCount = logs.length;
    auditLogConnection.pageInfo = pageInfo;

    return auditLogConnection;
  }

  private async isValidBuildRuleInput(
    groupId: string,
    ruleName: string,
    oldRuleId?: string,
    effectiveAtInput?: EffectiveAtInput,
    logic?: Logic,
    automationTriggerInputs?: AutomationTriggerInput[],
    deviceActionInputs?: DeviceActionInput[],
    notifyActionInputs?: NotifyActionInput[],
  ): Promise<CheckRuleInputResponse> {
    // check the duplicated for the rule name
    const existedRule = await this.ruleModel.findOne({
      $and: [
        {
          group: new Types.ObjectId(groupId),
        },
        {
          name: ruleName,
        },
      ],
    });
    if (existedRule !== null) {
      if (existedRule.id !== oldRuleId) {
        const response = {
          isValid: false,
          errorCode: ErrorCode.RULE_NAME_DUPLICATED,
          reason: 'rule name should not be duplicated for the same group.',
        };
        this.logger.warn(response);
        return response;
      }
    }

    // check the effectiveAtInput
    if (effectiveAtInput) {
      if (!IANAZone.isValidZone(effectiveAtInput.timezone)) {
        const response = {
          isValid: false,
          errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
          reason: 'the timezone you provided is not a valid IANAZone name.',
        };
        this.logger.warn(response);
        return response;
      }

      const startDate = DateTime.fromFormat(
        `${effectiveAtInput.effectiveDate.startMonth
          .toString()
          .padStart(2, '0')}${effectiveAtInput.effectiveDate.startDay
          .toString()
          .padStart(2, '0')}`,
        'Md',
      );

      const endDate = DateTime.fromFormat(
        `${effectiveAtInput.effectiveDate.endMonth
          .toString()
          .padStart(2, '0')}${effectiveAtInput.effectiveDate.endDay
          .toString()
          .padStart(2, '0')}`,
        'Md',
      );

      const fromTime = DateTime.fromFormat(
        `${effectiveAtInput.effectiveTime.fromHour
          .toString()
          .padStart(2, '0')}${effectiveAtInput.effectiveTime.fromMinute
          .toString()
          .padStart(2, '0')}`,
        'hhmm',
      );

      const endTime = DateTime.fromFormat(
        `${effectiveAtInput.effectiveTime.toHour
          .toString()
          .padStart(2, '0')}${effectiveAtInput.effectiveTime.toMinute
          .toString()
          .padStart(2, '0')}`,
        'hhmm',
      );

      if (
        !startDate.isValid ||
        !endDate.isValid ||
        !fromTime.isValid ||
        !endTime.isValid
      ) {
        const response = {
          isValid: false,
          errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
          reason: 'the date or time you provided is not currect.',
        };
        this.logger.warn(response);
        return response;
      }

      if (
        new Set(effectiveAtInput.effectiveWeekday).size !==
        effectiveAtInput.effectiveWeekday.length
      ) {
        const response = {
          isValid: false,
          errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
          reason:
            'the effectiveWeekday you provided is not currect. (duplicated)',
        };
        this.logger.warn(response);
        return response;
      }

      for (const day of effectiveAtInput.effectiveWeekday) {
        if (day < 1 || day > 7) {
          const response = {
            isValid: false,
            errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
            reason:
              'the effectiveWeekday you provided is not currect. (they should be between 1 to 7)',
          };
          this.logger.warn(response);
          return response;
        }
      }
    }

    // check the devices are under the specific group (if)
    if (automationTriggerInputs) {
      for (const triggerInput of automationTriggerInputs) {
        const devices = await this.deviceService.getDeviceByIds(
          triggerInput.deviceIds,
        );
        if (!(await this.deviceService.isDevicesUnderGroup(groupId, devices))) {
          const response = {
            isValid: false,
            errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
            reason:
              'the devices for createRuleInput.if is not under the specific groupId',
          };
          this.logger.warn(response);
          return response;
        }

        // check the logic existed if AutomationTriggerInput has many conditions
        if (triggerInput.conditions.length > 1) {
          if (!triggerInput.logic) {
            const response = {
              isValid: false,
              errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
              reason:
                'please provide the logic due to you have multiple ConditionInput.',
            };
            this.logger.warn(response);
            return response;
          }
        }

        // check the limitation for the value
        for (const condition of triggerInput.conditions) {
          const number = Number(condition.value);
          if (isNaN(number)) {
            // string
          } else {
            // number
            if (
              number < Number.MIN_SAFE_INTEGER ||
              number > Number.MAX_SAFE_INTEGER
            ) {
              const response = {
                isValid: false,
                errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
                reason:
                  'the value you provided in the conditions is too small or too large.',
              };
              this.logger.warn(response);
              return response;
            }

            const decimalPart = condition.value.split('.')[1];
            if (decimalPart) {
              if (decimalPart.length > 3) {
                const response = {
                  isValid: false,
                  errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
                  reason:
                    'the value you provided in the conditions with too many decimal places.',
                };
                this.logger.warn(response);
                return response;
              }
            }
          }
        }
      }

      // check the logic existed if there are many AutomationTriggerInput
      if (automationTriggerInputs.length > 1) {
        if (!logic) {
          const response = {
            isValid: false,
            errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
            reason:
              'please provide the logic due to you have multiple AutomationTriggerInput.',
          };
          this.logger.warn(response);
          return response;
        }
      }
    }

    // check the devices are under the specific group (thenDevice)
    if (deviceActionInputs) {
      for (const actionInput of deviceActionInputs) {
        const devices = await this.deviceService.getDeviceByIds(
          actionInput.deviceIds,
        );
        if (!(await this.deviceService.isDevicesUnderGroup(groupId, devices))) {
          const response = {
            isValid: false,
            errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
            reason:
              'the devices for createRuleInput.thenDevice is not under the specific groupId',
          };
          this.logger.warn(response);
          return response;
        }

        // check the limitation for setValue
        const number = Number(actionInput.setValue);
        if (isNaN(number)) {
          // string
        } else {
          // number
          if (
            number < Number.MIN_SAFE_INTEGER ||
            number > Number.MAX_SAFE_INTEGER
          ) {
            const response = {
              isValid: false,
              errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
              reason:
                'the setValue you provided in the deviceActionInput is too small or too large.',
            };
            this.logger.warn(response);
            return response;
          }

          const decimalPart = actionInput.setValue.split('.')[1];
          if (decimalPart) {
            if (decimalPart.length > 3) {
              const response = {
                isValid: false,
                errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
                reason:
                  'the setValue you provided in the deviceActionInput with too many decimal places.',
              };
              this.logger.warn(response);
              return response;
            }
          }
        }
      }
    }

    // check the users are under the specific group
    if (notifyActionInputs) {
      for (const actionInput of notifyActionInputs) {
        if (
          !(await this.userService.isUsersUnder(groupId, actionInput.userMails))
        ) {
          const response = {
            isValid: false,
            errorCode: ErrorCode.INPUT_PARAMETERS_INVALID,
            reason:
              'the users for createRuleInput.thenNotify is not under the specific groupId',
          };
          this.logger.warn(response);
          return response;
        }
      }
    }

    return {
      isValid: true,
    };
  }

  private async mongoQueryForRules(
    size: number,
    filterCondition: any,
    sortField: RuleSortField,
    sortOrder: SortOrder,
    reversed: boolean,
    after?: string,
  ): Promise<RuleEdge[]> {
    let mainCondition = {};

    let idAfter = {};
    let order: SortOrder;
    if (reversed) {
      idAfter = { $lt: after };
      switch (sortOrder) {
        case SortOrder.ASCENDING: {
          order = SortOrder.DESCENDING;
          break;
        }
        case SortOrder.DESCENDING: {
          order = SortOrder.ASCENDING;
          break;
        }
      }
    } else {
      idAfter = { $gt: after };
      order = sortOrder;
    }

    if (after) {
      let pageCondition = {};
      const lastRule = await this.ruleModel.findOne({
        _id: after,
      });

      switch (sortField) {
        case RuleSortField.ID: {
          pageCondition = {
            $or: [
              {
                _id:
                  order === SortOrder.ASCENDING
                    ? { $gt: lastRule._id as string }
                    : { $lt: lastRule._id as string },
              },
            ],
          };
          break;
        }
        case RuleSortField.NAME: {
          pageCondition = {
            $or: [
              {
                name:
                  order === SortOrder.ASCENDING
                    ? { $gt: lastRule.name }
                    : { $lt: lastRule.name },
              },
              {
                name: lastRule.name,
                _id: idAfter,
              },
            ],
          };
          break;
        }
        case RuleSortField.EFFECTIVE_DATE: {
          pageCondition = {
            $or: [
              {
                'effectiveAt.effectiveDate.startMonth':
                  order === SortOrder.ASCENDING
                    ? { $gt: lastRule.effectiveAt.effectiveDate.startMonth }
                    : { $lt: lastRule.effectiveAt.effectiveDate.startMonth },
              },
              {
                'effectiveAt.effectiveDate.startMonth':
                  lastRule.effectiveAt.effectiveDate.startMonth,
                'effectiveAt.effectiveDate.startDay':
                  order === SortOrder.ASCENDING
                    ? { $gt: lastRule.effectiveAt.effectiveDate.startDay }
                    : { $lt: lastRule.effectiveAt.effectiveDate.startDay },
              },
              {
                'effectiveAt.effectiveDate.startMonth':
                  lastRule.effectiveAt.effectiveDate.startMonth,
                'effectiveAt.effectiveDate.startDay':
                  lastRule.effectiveAt.effectiveDate.startDay,
                'effectiveAt.effectiveDate.endMonth':
                  order === SortOrder.ASCENDING
                    ? { $gt: lastRule.effectiveAt.effectiveDate.endMonth }
                    : { $lt: lastRule.effectiveAt.effectiveDate.endMonth },
              },
              {
                'effectiveAt.effectiveDate.startMonth':
                  lastRule.effectiveAt.effectiveDate.startMonth,
                'effectiveAt.effectiveDate.startDay':
                  lastRule.effectiveAt.effectiveDate.startDay,
                'effectiveAt.effectiveDate.endMonth':
                  lastRule.effectiveAt.effectiveDate.endMonth,
                'effectiveAt.effectiveDate.endDay':
                  order === SortOrder.ASCENDING
                    ? { $gt: lastRule.effectiveAt.effectiveDate.endDay }
                    : { $lt: lastRule.effectiveAt.effectiveDate.endDay },
              },
              {
                'effectiveAt.effectiveDate.startMonth':
                  lastRule.effectiveAt.effectiveDate.startMonth,
                'effectiveAt.effectiveDate.startDay':
                  lastRule.effectiveAt.effectiveDate.startDay,
                'effectiveAt.effectiveDate.endMonth':
                  lastRule.effectiveAt.effectiveDate.endMonth,
                'effectiveAt.effectiveDate.endDay':
                  lastRule.effectiveAt.effectiveDate.endDay,
                _id: idAfter,
              },
            ],
          };
          break;
        }
        case RuleSortField.EFFECTIVE_TIME: {
          pageCondition = {
            $or: [
              {
                'effectiveAt.effectiveTime.fromHour':
                  order === SortOrder.ASCENDING
                    ? { $gt: lastRule.effectiveAt.effectiveTime.fromHour }
                    : { $lt: lastRule.effectiveAt.effectiveTime.fromHour },
              },
              {
                'effectiveAt.effectiveTime.fromHour':
                  lastRule.effectiveAt.effectiveTime.fromHour,
                'effectiveAt.effectiveTime.fromMinute':
                  order === SortOrder.ASCENDING
                    ? { $gt: lastRule.effectiveAt.effectiveTime.fromMinute }
                    : { $lt: lastRule.effectiveAt.effectiveTime.fromMinute },
              },
              {
                'effectiveAt.effectiveTime.fromHour':
                  lastRule.effectiveAt.effectiveTime.fromHour,
                'effectiveAt.effectiveTime.fromMinute':
                  lastRule.effectiveAt.effectiveTime.fromMinute,
                'effectiveAt.effectiveTime.toHour':
                  order === SortOrder.ASCENDING
                    ? { $gt: lastRule.effectiveAt.effectiveTime.toHour }
                    : { $lt: lastRule.effectiveAt.effectiveTime.toHour },
              },
              {
                'effectiveAt.effectiveTime.fromHour':
                  lastRule.effectiveAt.effectiveTime.fromHour,
                'effectiveAt.effectiveTime.fromMinute':
                  lastRule.effectiveAt.effectiveTime.fromMinute,
                'effectiveAt.effectiveTime.toHour':
                  lastRule.effectiveAt.effectiveTime.toHour,
                'effectiveAt.effectiveTime.toMinute':
                  order === SortOrder.ASCENDING
                    ? { $gt: lastRule.effectiveAt.effectiveTime.toMinute }
                    : { $lt: lastRule.effectiveAt.effectiveTime.toMinute },
              },
              {
                'effectiveAt.effectiveTime.fromHour':
                  lastRule.effectiveAt.effectiveTime.fromHour,
                'effectiveAt.effectiveTime.fromMinute':
                  lastRule.effectiveAt.effectiveTime.fromMinute,
                'effectiveAt.effectiveTime.toHour':
                  lastRule.effectiveAt.effectiveTime.toHour,
                'effectiveAt.effectiveTime.toMinute':
                  lastRule.effectiveAt.effectiveTime.toMinute,
                _id: idAfter,
              },
            ],
          };
          break;
        }
      }

      mainCondition = {
        $and: [filterCondition, pageCondition],
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mainCondition = filterCondition;
    }

    let sortCondition = {};
    switch (sortField) {
      case RuleSortField.ID: {
        sortCondition = {
          _id: order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
        };
        break;
      }
      case RuleSortField.NAME: {
        sortCondition = {
          name: order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      }
      case RuleSortField.EFFECTIVE_DATE: {
        sortCondition = {
          'effectiveAt.effectiveDate.startMonth':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          'effectiveAt.effectiveDate.startDay':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          'effectiveAt.effectiveDate.endMonth':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          'effectiveAt.effectiveDate.endDay':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      }
      case RuleSortField.EFFECTIVE_TIME: {
        sortCondition = {
          'effectiveAt.effectiveTime.fromHour':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          'effectiveAt.effectiveTime.fromMinute':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          'effectiveAt.effectiveTime.toHour':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          'effectiveAt.effectiveTime.toMinute':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      }
    }

    const queryAfterLimit = await this.ruleModel
      .find(mainCondition, null, { strictQuery: false })
      .sort(sortCondition)
      .limit(size + 1);

    const edges = queryAfterLimit.flatMap((rule) => {
      const edge = new RuleEdge();
      edge.node = rule.toApolloRuleAutomation();
      edge.cursor = rule._id as string;
      return edge;
    });

    return edges;
  }

  private async mongoQueryForSubscriptions(
    user: User,
    size: number,
    filterCondition: any,
    sortField: SubscriptionSortField,
    sortOrder: SortOrder,
    reversed: boolean,
    after?: string,
  ): Promise<SubscriptionEdge[]> {
    let mainCondition = {};

    let idAfter = {};
    let order: SortOrder;
    if (reversed) {
      idAfter = { $lt: new Types.ObjectId(after) };
      switch (sortOrder) {
        case SortOrder.ASCENDING: {
          order = SortOrder.DESCENDING;
          break;
        }
        case SortOrder.DESCENDING: {
          order = SortOrder.ASCENDING;
          break;
        }
      }
    } else {
      idAfter = { $gt: new Types.ObjectId(after) };
      order = sortOrder;
    }

    if (after) {
      let pageCondition = {};
      const lastSubscription = await this.subscriptionModel.findOne({
        _id: after,
      });

      switch (sortField) {
        case SubscriptionSortField.ID: {
          pageCondition = {
            $or: [
              {
                'rule._id':
                  order === SortOrder.ASCENDING
                    ? { $gt: lastSubscription.rule._id }
                    : { $lt: lastSubscription.rule._id },
              },
              {
                'rule._id': lastSubscription.rule._id,
                _id: idAfter,
              },
            ],
          };
          break;
        }
        case SubscriptionSortField.NAME: {
          pageCondition = {
            $or: [
              {
                'rule.name':
                  order === SortOrder.ASCENDING
                    ? { $gt: lastSubscription.rule.name }
                    : { $lt: lastSubscription.rule.name },
              },
              {
                name: lastSubscription.rule.name,
                _id: idAfter,
              },
            ],
          };
          break;
        }
        case SubscriptionSortField.EFFECTIVE_DATE: {
          pageCondition = {
            $or: [
              {
                'rule.effectiveAt.effectiveDate.startMonth':
                  order === SortOrder.ASCENDING
                    ? {
                        $gt: lastSubscription.rule.effectiveAt.effectiveDate
                          .startMonth,
                      }
                    : {
                        $lt: lastSubscription.rule.effectiveAt.effectiveDate
                          .startMonth,
                      },
              },
              {
                'rule.effectiveAt.effectiveDate.startMonth':
                  lastSubscription.rule.effectiveAt.effectiveDate.startMonth,
                'rule.effectiveAt.effectiveDate.startDay':
                  order === SortOrder.ASCENDING
                    ? {
                        $gt: lastSubscription.rule.effectiveAt.effectiveDate
                          .startDay,
                      }
                    : {
                        $lt: lastSubscription.rule.effectiveAt.effectiveDate
                          .startDay,
                      },
              },
              {
                'rule.effectiveAt.effectiveDate.startMonth':
                  lastSubscription.rule.effectiveAt.effectiveDate.startMonth,
                'rule.effectiveAt.effectiveDate.startDay':
                  lastSubscription.rule.effectiveAt.effectiveDate.startDay,
                'rule.effectiveAt.effectiveDate.endMonth':
                  order === SortOrder.ASCENDING
                    ? {
                        $gt: lastSubscription.rule.effectiveAt.effectiveDate
                          .endMonth,
                      }
                    : {
                        $lt: lastSubscription.rule.effectiveAt.effectiveDate
                          .endMonth,
                      },
              },
              {
                'rule.effectiveAt.effectiveDate.startMonth':
                  lastSubscription.rule.effectiveAt.effectiveDate.startMonth,
                'rule.effectiveAt.effectiveDate.startDay':
                  lastSubscription.rule.effectiveAt.effectiveDate.startDay,
                'rule.effectiveAt.effectiveDate.endMonth':
                  lastSubscription.rule.effectiveAt.effectiveDate.endMonth,
                'rule.effectiveAt.effectiveDate.endDay':
                  order === SortOrder.ASCENDING
                    ? {
                        $gt: lastSubscription.rule.effectiveAt.effectiveDate
                          .endDay,
                      }
                    : {
                        $lt: lastSubscription.rule.effectiveAt.effectiveDate
                          .endDay,
                      },
              },
              {
                'rule.effectiveAt.effectiveDate.startMonth':
                  lastSubscription.rule.effectiveAt.effectiveDate.startMonth,
                'rule.effectiveAt.effectiveDate.startDay':
                  lastSubscription.rule.effectiveAt.effectiveDate.startDay,
                'rule.effectiveAt.effectiveDate.endMonth':
                  lastSubscription.rule.effectiveAt.effectiveDate.endMonth,
                'rule.effectiveAt.effectiveDate.endDay':
                  lastSubscription.rule.effectiveAt.effectiveDate.endDay,
                _id: idAfter,
              },
            ],
          };
          break;
        }
        case SubscriptionSortField.EFFECTIVE_TIME: {
          pageCondition = {
            $or: [
              {
                'rule.effectiveAt.effectiveTime.fromHour':
                  order === SortOrder.ASCENDING
                    ? {
                        $gt: lastSubscription.rule.effectiveAt.effectiveTime
                          .fromHour,
                      }
                    : {
                        $lt: lastSubscription.rule.effectiveAt.effectiveTime
                          .fromHour,
                      },
              },
              {
                'rule.effectiveAt.effectiveTime.fromHour':
                  lastSubscription.rule.effectiveAt.effectiveTime.fromHour,
                'rule.effectiveAt.effectiveTime.fromMinute':
                  order === SortOrder.ASCENDING
                    ? {
                        $gt: lastSubscription.rule.effectiveAt.effectiveTime
                          .fromMinute,
                      }
                    : {
                        $lt: lastSubscription.rule.effectiveAt.effectiveTime
                          .fromMinute,
                      },
              },
              {
                'rule.effectiveAt.effectiveTime.fromHour':
                  lastSubscription.rule.effectiveAt.effectiveTime.fromHour,
                'rule.effectiveAt.effectiveTime.fromMinute':
                  lastSubscription.rule.effectiveAt.effectiveTime.fromMinute,
                'rule.effectiveAt.effectiveTime.toHour':
                  order === SortOrder.ASCENDING
                    ? {
                        $gt: lastSubscription.rule.effectiveAt.effectiveTime
                          .toHour,
                      }
                    : {
                        $lt: lastSubscription.rule.effectiveAt.effectiveTime
                          .toHour,
                      },
              },
              {
                'rule.effectiveAt.effectiveTime.fromHour':
                  lastSubscription.rule.effectiveAt.effectiveTime.fromHour,
                'rule.effectiveAt.effectiveTime.fromMinute':
                  lastSubscription.rule.effectiveAt.effectiveTime.fromMinute,
                'rule.effectiveAt.effectiveTime.toHour':
                  lastSubscription.rule.effectiveAt.effectiveTime.toHour,
                'rule.effectiveAt.effectiveTime.toMinute':
                  order === SortOrder.ASCENDING
                    ? {
                        $gt: lastSubscription.rule.effectiveAt.effectiveTime
                          .toMinute,
                      }
                    : {
                        $lt: lastSubscription.rule.effectiveAt.effectiveTime
                          .toMinute,
                      },
              },
              {
                'rule.effectiveAt.effectiveTime.fromHour':
                  lastSubscription.rule.effectiveAt.effectiveTime.fromHour,
                'rule.effectiveAt.effectiveTime.fromMinute':
                  lastSubscription.rule.effectiveAt.effectiveTime.fromMinute,
                'rule.effectiveAt.effectiveTime.toHour':
                  lastSubscription.rule.effectiveAt.effectiveTime.toHour,
                'rule.effectiveAt.effectiveTime.toMinute':
                  lastSubscription.rule.effectiveAt.effectiveTime.toMinute,
                _id: idAfter,
              },
            ],
          };
          break;
        }
        case SubscriptionSortField.GROUP: {
          pageCondition = {
            $or: [
              {
                'rule.group.name':
                  order === SortOrder.ASCENDING
                    ? { $gt: lastSubscription.rule.group.name }
                    : { $lt: lastSubscription.rule.group.name },
              },
              {
                'rule.group.name': lastSubscription.rule.group.name,
                _id: idAfter,
              },
            ],
          };
          break;
        }
      }

      mainCondition = {
        $and: [filterCondition, pageCondition],
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mainCondition = filterCondition;
    }

    let sortCondition = {};
    switch (sortField) {
      case SubscriptionSortField.ID: {
        sortCondition = {
          'rule._id': order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: reversed ? -1 : 1,
        };
        break;
      }
      case SubscriptionSortField.NAME: {
        sortCondition = {
          'rule.name': order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: reversed ? -1 : 1,
        };
        break;
      }
      case SubscriptionSortField.EFFECTIVE_DATE: {
        sortCondition = {
          'rule.effectiveAt.effectiveDate.startMonth':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          'rule.effectiveAt.effectiveDate.startDay':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          'rule.effectiveAt.effectiveDate.endMonth':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          'rule.effectiveAt.effectiveDate.endDay':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: reversed ? -1 : 1,
        };
        break;
      }
      case SubscriptionSortField.EFFECTIVE_TIME: {
        sortCondition = {
          'rule.effectiveAt.effectiveTime.fromHour':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          'rule.effectiveAt.effectiveTime.fromMinute':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          'rule.effectiveAt.effectiveTime.toHour':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          'rule.effectiveAt.effectiveTime.toMinute':
            order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: reversed ? -1 : 1,
        };
        break;
      }
      case SubscriptionSortField.GROUP: {
        sortCondition = {
          'rule.group.name': order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: reversed ? -1 : 1,
        };
        break;
      }
    }

    let subscriptions =
      await this.subscriptionModel.aggregate<RuleSubscription>([
        {
          $match: {
            user: user._id,
          },
        },
        // rule
        {
          $lookup: {
            from: 'automation_rules',
            localField: 'rule',
            foreignField: '_id',
            as: 'rule',
          },
        },
        { $unwind: '$rule' },
        // rule.group
        {
          $lookup: {
            from: 'groups',
            localField: 'rule.group',
            foreignField: '_id',
            as: 'rule.group',
          },
        },
        { $unwind: '$rule.group' },
        // rule.if
        {
          $lookup: {
            from: 'automation_triggers',
            localField: 'rule.if',
            foreignField: '_id',
            as: 'rule.if',
          },
        },
        {
          $lookup: {
            from: 'devices',
            localField: 'rule.if.devices',
            foreignField: '_id',
            as: 'rule.if.devices',
          },
        },
        // rule.then
        {
          $lookup: {
            from: 'automation_actions',
            localField: 'rule.then',
            foreignField: '_id',
            as: 'rule.then',
          },
        },
        {
          $lookup: {
            from: 'devices',
            localField: 'rule.then.devices',
            foreignField: '_id',
            as: 'rule.then.devices',
          },
        },
        // filter by keyword
        {
          $match: mainCondition,
        },
        // sorting
        {
          $sort: sortCondition,
        },
        // limit
        {
          $limit: size + 1,
        },
      ]);

    subscriptions = await Promise.all(
      subscriptions.map((subscription) => {
        return this.subscriptionModel.findById(subscription._id);
      }),
    );

    return subscriptions.map((s) => {
      const edge = new SubscriptionEdge();
      edge.cursor = s.id;
      edge.node = s.toApolloRuleSubscription();
      return edge;
    });
  }

  private async mongoQueryForAuditLogs(
    user: User,
    size: number,
    filterCondition: any,
    sortField: AuditLogSortField,
    sortOrder: SortOrder,
    reversed: boolean,
    after?: string,
  ): Promise<AuditLogEdge[]> {
    let mainCondition = {};

    let idAfter = {};
    let order: SortOrder;
    if (reversed) {
      idAfter = { $lt: new Types.ObjectId(after) };
      switch (sortOrder) {
        case SortOrder.ASCENDING: {
          order = SortOrder.DESCENDING;
          break;
        }
        case SortOrder.DESCENDING: {
          order = SortOrder.ASCENDING;
          break;
        }
      }
    } else {
      idAfter = { $gt: new Types.ObjectId(after) };
      order = sortOrder;
    }

    if (after) {
      let pageCondition = {};
      const lastAuditLog = await this.logModel.findOne({
        _id: after,
      });

      switch (sortField) {
        case AuditLogSortField.ID: {
          pageCondition = {
            $or: [
              {
                ruleId:
                  order === SortOrder.ASCENDING
                    ? { $gt: lastAuditLog.ruleId }
                    : { $lt: lastAuditLog.ruleId },
              },
              {
                ruleId: lastAuditLog.ruleId,
                _id: idAfter,
              },
            ],
          };
          break;
        }
        case AuditLogSortField.NAME: {
          pageCondition = {
            $or: [
              {
                ruleName:
                  order === SortOrder.ASCENDING
                    ? { $gt: lastAuditLog.ruleName }
                    : { $lt: lastAuditLog.ruleName },
              },
              {
                ruleName: lastAuditLog.ruleName,
                _id: idAfter,
              },
            ],
          };
          break;
        }
        case AuditLogSortField.GROUP: {
          pageCondition = {
            $or: [
              {
                'group.name':
                  order === SortOrder.ASCENDING
                    ? { $gt: lastAuditLog.group.name }
                    : { $lt: lastAuditLog.group.name },
              },
              {
                'group.name': lastAuditLog.group.name,
                _id: idAfter,
              },
            ],
          };
          break;
        }
        case AuditLogSortField.TIME: {
          pageCondition = {
            $or: [
              {
                triggeredTime:
                  order === SortOrder.ASCENDING
                    ? { $gt: lastAuditLog.triggeredTime }
                    : { $lt: lastAuditLog.triggeredTime },
              },
              {
                triggeredTime: lastAuditLog.triggeredTime,
                _id: idAfter,
              },
            ],
          };
          break;
        }
      }

      mainCondition = {
        $and: [filterCondition, pageCondition],
      };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      mainCondition = filterCondition;
    }

    let sortCondition = {};
    switch (sortField) {
      case AuditLogSortField.ID: {
        sortCondition = {
          ruleId: order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: reversed ? -1 : 1,
        };
        break;
      }
      case AuditLogSortField.NAME: {
        sortCondition = {
          ruleName: order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: reversed ? -1 : 1,
        };
        break;
      }
      case AuditLogSortField.GROUP: {
        sortCondition = {
          'group.name': order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: reversed ? -1 : 1,
        };
        break;
      }
      case AuditLogSortField.TIME: {
        sortCondition = {
          triggeredTime: order === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: reversed ? -1 : 1,
        };
        break;
      }
    }

    let auditLogs = await this.logModel.aggregate<RuleAuditLog>([
      {
        $match: {
          $or: [
            // notify to the user
            {
              'notifyAction.users': user._id,
            },
            // groups which user has the permission to access
            {
              group: {
                $in: await this.groupsUnderPermission(user),
              },
            },
          ],
        },
      },
      // group
      {
        $lookup: {
          from: 'groups',
          localField: 'group',
          foreignField: '_id',
          as: 'group',
        },
      },
      { $unwind: '$group' },
      // filter by keyword
      {
        $match: mainCondition,
      },
      // sorting
      {
        $sort: sortCondition,
      },
      // limit
      {
        $limit: size + 1,
      },
    ]);

    auditLogs = await Promise.all(
      auditLogs.map((log) => {
        return this.logModel.findById(log._id);
      }),
    );

    return auditLogs.map((s) => {
      const edge = new AuditLogEdge();
      edge.cursor = s.id;
      edge.node = s.toApolloRuleAuditLog();
      return edge;
    });
  }

  private async createAutomationTriggers(
    automationTriggerInputs: AutomationTriggerInput[],
  ): Promise<AutomationTrigger[]> {
    // create the AutomationTrigger in the db
    const triggers = await Promise.all<AutomationTrigger>(
      automationTriggerInputs.map(async (triggerInput) => {
        // subscribe the MQTT here
        for (const deviceId of triggerInput.deviceIds) {
          const device = await this.deviceService.getDeviceById(deviceId);
          const projectKey = device?.groups[0].projectKey;
          for (const condition of triggerInput.conditions) {
            // remove the white space between each element for IS_ONE_OF, BETWEEN
            if (
              condition.operator === TriggerOperator.IS_ONE_OF ||
              condition.operator === TriggerOperator.BETWEEN
            ) {
              condition.value = condition.value.replace(/\s*,\s*/g, ',');
            }
            const sensor = device.getSensor(condition.sensorId);
            if (sensor)
              this.addMqttTopic(projectKey, deviceId, sensor.iotSensorId);
          }
        }

        return this.triggerModel.create({
          deviceType: triggerInput.deviceType,
          devices: await this.deviceService.getDeviceByIds(
            triggerInput.deviceIds,
          ),
          logic: triggerInput.logic,
          conditions: triggerInput.conditions,
        });
      }),
    );

    return triggers;
  }

  private async createNotifyActions(
    notifyActionInputs: NotifyActionInput[],
  ): Promise<NotifyAction[]> {
    // create the NotifyAction in the db (if any)
    let notifyActions: NotifyAction[] = [];
    if (notifyActionInputs) {
      notifyActions = await Promise.all<NotifyAction>(
        notifyActionInputs.map(async (actionInput) => {
          return this.actionNotifyModel
            .create({
              actionType: ActionType.NOTIFY,
              users: await this.userService.findUsers(actionInput.userMails),
              message: actionInput.message,
              snapshot: actionInput.snapshot,
            })
            .then((t) => t.populate('users'));
        }),
      );
    }

    return notifyActions;
  }

  private async createDeviceActions(
    deviceActionInpus: DeviceActionInput[],
  ): Promise<DeviceAction[]> {
    // create the DeviceAction in the db (if any)
    let deviceActions: DeviceAction[] = [];
    if (deviceActionInpus) {
      deviceActions = await Promise.all<DeviceAction>(
        deviceActionInpus.map(async (actionInput) => {
          return this.actionDeviceModel.create({
            actionType: ActionType.DEVICE,
            deviceType: actionInput.deviceType,
            devices: await this.deviceService.getDeviceByIds(
              actionInput.deviceIds,
            ),
            sensorId: actionInput.sensorId,
            setValue: actionInput.setValue,
          });
        }),
      );
    }
    return deviceActions;
  }

  private async createRuleSubscription(
    rule: RuleAutomation,
    notifyActions: NotifyAction[],
  ) {
    // delete all subscriptions not in the notifyAction.users
    const users = notifyActions
      .map((actions) => actions.users.map((it) => it._id))
      .reduce((acc, curVal) => {
        return acc.concat(curVal);
      }, []);
    await this.subscriptionModel.deleteMany({
      rule: rule._id,
      user: {
        $nin: users,
      },
    });

    // create the RuleSubscription in the db (if any notifyActions)
    for (const notifyAction of notifyActions) {
      for (const user of notifyAction.users) {
        const subscription = await this.subscriptionModel.findOne({
          user: user._id,
          rule: rule._id,
        });

        // create subscription only when subscription not existed before
        if (!subscription) {
          await this.subscriptionModel.create({
            user,
            rule,
            byLine: user.isLineConnected(),
            byMail: true,
          });
        }
      }
    }
  }

  private async filterForSearchRules(
    groupId: string,
    keyword: string,
  ): Promise<Array<any>> {
    // if without the keyword
    if (!keyword) {
      return [];
    }

    // if the keyword existed
    const regKeyword = new RegExp(StringUtils.escapeRegExp(keyword), 'i');

    // ruleId
    let objectId: Types.ObjectId;
    try {
      objectId = new Types.ObjectId(keyword);
    } catch {
      objectId = null;
    }

    // deviceId, deviceName, sensorId
    const mapDeviceFilter = new MapDeviceFilter();
    mapDeviceFilter.keyword = keyword;
    const devices = await this.deviceService.devicesOnMap(
      groupId,
      mapDeviceFilter,
    );

    const triggers = await this.triggerModel.find({
      $or: [
        {
          devices: {
            $in: devices.map((it) => it._id),
          },
        },
        { 'conditions.sensorId': { $regex: regKeyword } },
      ],
    });

    const deviceActions = await this.actionDeviceModel.find({
      $or: [
        {
          devices: {
            $in: devices.map((it) => it._id),
          },
        },
        { sensorId: { $regex: regKeyword } },
      ],
    });

    // userName, message
    const users = await this.userService.searchUsersByKeyword(groupId, keyword);

    const notifyActions = await this.actionNotifyModel.find({
      $or: [
        {
          users: {
            $in: users.map((it) => it._id),
          },
        },
        { message: { $regex: regKeyword } },
      ],
    });

    return [
      {
        $or: [
          // ruleId
          { _id: objectId },
          // ruleName
          { name: { $regex: regKeyword } },
          {
            if: {
              $in: triggers.map((it) => new Types.ObjectId(it._id as string)),
            },
          },
          {
            then: {
              $in: [
                ...deviceActions.map(
                  (it) => new Types.ObjectId(it._id as string),
                ),
                ...notifyActions.map(
                  (it) => new Types.ObjectId(it._id as string),
                ),
              ],
            },
          },
        ],
      },
    ];
  }

  private async filterForSearchSubscriptions(
    user: User,
    keyword: string,
  ): Promise<any> {
    // if without the keyword
    if (!keyword) {
      return {};
    }
    const groupId = user.groupInUse().id;

    // if the keyword existed
    const regKeyword = new RegExp(StringUtils.escapeRegExp(keyword), 'i');

    // ruleId
    let objectId: Types.ObjectId;
    try {
      objectId = new Types.ObjectId(keyword);
    } catch {
      objectId = null;
    }

    // deviceId, deviceName, sensorId
    const mapDeviceFilter = new MapDeviceFilter();
    mapDeviceFilter.keyword = keyword;
    const devices = await this.deviceService.devicesOnMap(
      groupId,
      mapDeviceFilter,
    );

    const triggers = await this.triggerModel.find({
      $or: [
        {
          devices: {
            $in: devices.map((it) => it._id),
          },
        },
        { 'conditions.sensorId': { $regex: regKeyword } },
      ],
    });

    const deviceActions = await this.actionDeviceModel.find({
      $or: [
        {
          devices: {
            $in: devices.map((it) => it._id),
          },
        },
        { sensorId: { $regex: regKeyword } },
      ],
    });

    // userName, message
    const users = await this.userService.searchUsersByKeyword(groupId, keyword);

    const notifyActions = await this.actionNotifyModel.find({
      $or: [
        {
          users: {
            $in: users.map((it) => it._id),
          },
        },
        { message: { $regex: regKeyword } },
      ],
    });

    return {
      $or: [
        // ruleId
        { 'rule._id': objectId },
        // ruleName
        { 'rule.name': { $regex: regKeyword } },
        {
          'rule.if': {
            $in: triggers.map((it) => new Types.ObjectId(it._id as string)),
          },
        },
        {
          'rule.then': {
            $in: [
              ...deviceActions.map(
                (it) => new Types.ObjectId(it._id as string),
              ),
              ...notifyActions.map(
                (it) => new Types.ObjectId(it._id as string),
              ),
            ],
          },
        },
      ],
    };
  }

  private async filterForSearchAuditLogs(
    user: User,
    keyword: string,
  ): Promise<any> {
    // if without the keyword
    if (!keyword) {
      return {};
    }
    const groupId = user.groupInUse().id;

    // if the keyword existed
    const regKeyword = new RegExp(StringUtils.escapeRegExp(keyword), 'i');

    // ruleId
    let objectId: Types.ObjectId;
    try {
      objectId = new Types.ObjectId(keyword);
    } catch {
      objectId = null;
    }

    // deviceId, deviceName, sensorId
    const mapDeviceFilter = new MapDeviceFilter();
    mapDeviceFilter.keyword = keyword;
    const devices = await this.deviceService.devicesOnMap(
      groupId,
      mapDeviceFilter,
    );

    const users = await this.userService.searchUsersByKeyword(groupId, keyword);

    return {
      $or: [
        // ruleId
        { ruleId: objectId },
        // ruleName
        { ruleName: { $regex: regKeyword } },
        // groupName
        { 'group.name': { $regex: regKeyword } },
        // device
        {
          'deviceActions.devices': {
            $in: devices.map((it) => it._id),
          },
        },
        // sensorId
        {
          'deviceActions.sensorId': { $regex: regKeyword },
        },
        // username
        {
          'notifyActions.users': {
            $in: users.map((it) => it._id),
          },
        },
        // message
        {
          'notifyActions.message': { $regex: regKeyword },
        },
        // triggeredExpression
        {
          triggeredExpression: { $regex: regKeyword },
        },
        // triggeredCurrentValue
        {
          triggeredCurrentValue: { $regex: regKeyword },
        },
      ],
    };
  }

  private addMqttTopic(
    projectKey: string,
    deviceId: string,
    iotSensorId: string,
  ) {
    const topic = `/v1/device/${deviceId}/sensor/${iotSensorId}/rawdata`;
    let mqttClientOption = this.mqttClientOptions.find(
      (it) => it.username === projectKey,
    );
    if (!mqttClientOption) {
      mqttClientOption = {
        username: projectKey,
        password: projectKey,
        topics: [],
      };
      this.mqttClientOptions.push(mqttClientOption);
    }

    // topic should not be duplicated
    const existed = mqttClientOption.topics.find((it) => it.topic === topic);
    if (existed) {
      existed.count += 1;
    } else {
      mqttClientOption.topics.push({
        topic,
        count: 1,
      });
      // subscribe from the MQTT
      mqttClientOption.client?.subscribe(topic);
    }
  }

  private deleteMqttTopic(
    projectKey: string,
    deviceId: string,
    iotSensorId: string,
  ) {
    const mqttClientOption = this.mqttClientOptions.find(
      (it) => it.username === projectKey,
    );
    if (mqttClientOption) {
      const topic = `/v1/device/${deviceId}/sensor/${iotSensorId}/rawdata`;
      const mqttTopic = mqttClientOption.topics.find(
        (it) => it.topic === topic,
      );
      if (mqttTopic) {
        mqttTopic.count -= 1;
        if (mqttTopic.count === 0) {
          // delete from options
          const index = mqttClientOption.topics.indexOf(mqttTopic, 0);
          if (index > -1) {
            mqttClientOption.topics.splice(index, 1);
          }

          // unscribe from the MQTT
          mqttClientOption.client?.unsubscribe(topic);
        }
      }
    }
  }

  private async groupsUnderPermission(user: User): Promise<Types.ObjectId[]> {
    // check the permission for VIEW.AUTOMATION_RULE_MANAGEMENT
    const groupInUse = user.groupInUse();
    const permission = user.groups.find((gp) => gp.inUse).permission;
    const hasPermission = permission.rules.some((r) => {
      return (
        r.action === Action.VIEW &&
        r.subject === Subject.AUTOMATION_RULE_MANAGEMENT
      );
    });

    if (hasPermission) {
      // return all groups
      return this.groupService.getAllChilds(groupInUse._id, true);
    } else {
      return [];
    }
  }
}
