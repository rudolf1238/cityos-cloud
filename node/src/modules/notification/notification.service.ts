import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Types, Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import {
  Notification,
  SendList,
  DeviceStatusInfo,
  DeviceStatusInfoLogs,
  EmailNotificationLogs,
} from 'src/models/notification';
import {
  Device,
  DeviceStatus,
  DeviceStatusResponse,
  Language,
} from 'src/graphql.schema';
import { RedisPubSub } from 'graphql-redis-subscriptions';
import { connect, MqttClient } from 'mqtt';
import { ConfigService } from '@nestjs/config';
import { ApolloError } from 'apollo-server-express';
import StringUtils from 'src/utils/StringUtils';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import Redis from 'ioredis';
import { Constants } from 'src/constants';
//import { Lamp, LampDocument } from 'src/models/lamp';
import { MailService } from '../mail/mail.service';
// import * as enUSMail from 'src/locales/en-US/mail.json';
// import * as zhHantTWMail from 'src/locales/zh-Hant-TW/mail.json';
import mjml2html from 'mjml';
import nodemailer, { SendMailOptions } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
//import { ProducerService } from './producer/producer.service';
//import { KafkaPayload } from './kafka-common/kafka.message';
import { EmailNotificationLogsDocument } from '../../models/notification';
import { DeviceDocument } from '../../models/device';
import {
  NotificationDocument,
  DeviceStatusInfoDocument,
  DeviceStatusInfoLogsDocument,
} from '../../models/notification';

interface MqttStatusResponse {
  deviceId: string;
  createTime: string;
  status: string;
}

const withCancel = (
  asyncIterator: AsyncIterator<unknown>,
  onCancel: () => void,
) => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const asyncReturn = asyncIterator.return;
  asyncIterator.return = () => {
    onCancel();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return asyncReturn
      ? asyncReturn.call(asyncIterator)
      : Promise.resolve({ value: undefined, done: true });
  };

  return asyncIterator;
};

interface MailContent {
  subject: string;
  message?: string;
  action?: string;
  link?: string;
  extra?: string;
  signature?: string;
  footer?: string;
}

@Injectable()
export class NotificationService implements OnModuleInit {
  private pubSub: RedisPubSub;

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,

    @InjectModel(DeviceStatusInfo.name)
    private readonly deviceStatusInfoModel: Model<DeviceStatusInfoDocument>,

    @InjectModel(DeviceStatusInfoLogs.name)
    private readonly deviceStatusInfoLogsModel: Model<DeviceStatusInfoLogsDocument>,

    @InjectModel(EmailNotificationLogs.name)
    private readonly emailNotificationLogsModel: Model<EmailNotificationLogsDocument>,

    @InjectModel(Device.name)
    private readonly DeviceModel: Model<DeviceDocument>,

    //private readonly producer: ProducerService,

    // @InjectModel(Lamp.name)
    // private readonly lampModel: Model<LampDocument>,
    private readonly chtiotClientService: ChtiotClientService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  private mailTransport = nodemailer.createTransport({
    host: this.configService.get<string>('SMTP_MAIL_SERVER_HOST'),
    port: this.configService.get<number>('SMTP_MAIL_SERVER_PORT'),
    secure: false,
    auth: {
      user: this.configService.get<string>('SMTP_MAIL_SERVER_USERNAME'),
      pass: this.configService.get<string>('SMTP_MAIL_SERVER_PASSWORD'),
    },
  });

  private readonly logger = new Logger(NotificationService.name);

  private readonly mailServiceLogger = new Logger(MailService.name);

  async onModuleInit() {
    //initialize device_status collection.
    await this.deviceStatusInfoModel.deleteMany({});
    const deviceStatusInfos = await this.notificationModel.find(
      {},
      {
        _id: 1,
        deviceId: 1,
        status: 1,
        previousStatus: '',
        groupsLength: { $size: '$groups' },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    );
    await this.deviceStatusInfoModel.insertMany(deviceStatusInfos);
    await this.addAllDeviceStatusLog();

    //update all devices status to the cityos' database
    const devices = await this.notificationModel
      .find({ $expr: { $gt: [{ $size: '$groups' }, 0] } })
      .populate({ path: 'groups' });
    await Promise.all(
      devices.flatMap(async (device) => {
        const { projectKey } = device.groups[0];
        const status = await this.chtiotClientService
          .getActiveStatus(projectKey, device.deviceId)
          .catch((_error: ApolloError) => {
            return DeviceStatus.ERROR;
          });
        await this.updateDeviceStatus(device.deviceId, status);
      }),
    );

    const allDevices: Notification[] = await this.getAllDevices();
    const deviceIds: string[] = [];
    const projectKeys: string[] = [];
    const options = {
      retryStrategy: (times: number) => {
        // reconnect after
        return Math.min(times * 50, 2000);
      },
    };

    let i = 0;
    for (i = 0; i < allDevices.length; i++) {
      deviceIds[i] = allDevices[i].deviceId;
      projectKeys[i] = allDevices[i].projectKey[0];
    }

    const dateReviver = (_: any, value: string) => {
      const isISO8601Z =
        /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/;
      if (typeof value === 'string' && isISO8601Z.test(value)) {
        const tempDateNumber = Date.parse(value);
        if (!Number.isNaN(tempDateNumber)) {
          return new Date(tempDateNumber);
        }
      }
      return value;
    };

    //Publish/subscribe.
    this.pubSub = new RedisPubSub({
      publisher: new Redis(
        this.configService.get<string>('REDIS_URI'),
        options,
      ),
      subscriber: new Redis(
        this.configService.get<string>('REDIS_URI'),
        options,
      ),
      reviver: dateReviver,
    });

    //Listen to whether the device state has been changed.
    const redisTopic = `${Constants.PREFIX_FOR_DEVICE_STATUS_TOPIC}`;
    void this.listenDevicesStatusChanged(
      // this.producer,
      this.pubSub,
      redisTopic,
      deviceIds,
      projectKeys,
    );
  }

  async sendNotification(deviceId: string, status: string) {
    const deviceStatusInfo = await this.getDeviceStatusInfo(deviceId);

    if (
      deviceStatusInfo !== undefined &&
      deviceStatusInfo?.status != undefined &&
      deviceStatusInfo?.status.trim() !== ''
    ) {
      const deviceCurrentStatus: DeviceStatus =
        StringUtils.deviceStatusFrom(status);
      const devicePreviousStatus: string =
        deviceStatusInfo?.status.trim() || '';

      if (devicePreviousStatus !== deviceCurrentStatus.toString().trim()) {
        // this.logger.log(
        //   String().concat('Previous Status:', devicePreviousStatus),
        // );
        // this.logger.log(
        //   String().concat(
        //     'Current Status:',
        //     deviceCurrentStatus.toString().trim(),
        //   ),
        // );

        await this.sendNotification_Email(
          deviceId,
          devicePreviousStatus,
          deviceCurrentStatus,
        );

        // await this.sendNotification_LINE(deviceId, devicePreviousStatus, deviceCurrentStatus,);

        if (deviceStatusInfo !== undefined) {
          await this.updateStatusFromDeviceStatus(
            deviceStatusInfo._id,
            deviceCurrentStatus.toString().trim(),
            deviceStatusInfo.status,
          );
          await this.addDeviceStatusLog(
            deviceStatusInfo._id,
            deviceStatusInfo.deviceId,
            deviceCurrentStatus.toString().trim(),
            deviceStatusInfo.status,
            deviceStatusInfo.groupsLength,
            deviceStatusInfo.createdAt,
          );
        }
      }
    }
  }

  async sendNotification_Email(
    deviceId: string,
    previousStatus: string,
    currentStatus: DeviceStatus,
  ) {
    const notifyType = 'EMAIL';
    const sendListbyType: SendList[] = await this.getNotificaionListbyType(
      deviceId,
      notifyType,
    );
    const sendList: SendList[] = sendListbyType;

    let n = 0;
    for (n = 0; n < sendList.length; n++) {
      await this.sendMailNotification(
        sendList[n],
        previousStatus,
        currentStatus,
        Language.en_US,
      );
      await this.addEmailNotificationLog(
        sendList[n].deviceId,
        sendList[n].devcieName,
        sendList[n].userName,
        previousStatus,
        currentStatus,
        sendList[n].email,
        sendList[n].emailTitle,
        sendList[n].emailContent,
      );
    }
  }

  async sendNotification_LINE(
    _deviceId: string,
    _previousStatus: string,
    _status: DeviceStatus,
  ) {
    //TODO: 待Noodoe完成LINE發送介面後,再接取此段功能,以共用同一發送機制。
    //const deviceId = '28015312610';
    /*
     const notifyType = 'LINE';
     const sendListbyType: SendList[] = await this.getNotificaionListbyType(
       deviceId,
       notifyType,
     );
     const sendListbyDeviceList: SendList[] =
       await this.getNotificaionListbyDeviceId(deviceId, notifyType);
 
     const sendList: SendList[] = await Promise.all(
       sendListbyType.concat(sendListbyDeviceList),
     );
 
     let n = 0;
     for (n = 0; n < sendList.length; n++) {
       await this.sendLineNotification(sendList[n], Language.EN);
     }
   */
  }

  async updateDeviceStatus(
    deviceId: string,
    status: DeviceStatus,
  ): Promise<Notification> {
    //Promise<Device> {
    const device = await this.getDeviceById(deviceId);
    const attachOn = device?.attributes.find((it) => {
      return it.key === Constants.KEY_ATTR_ATTACH_ON;
    });

    // if it is attached device
    if (attachOn) {
      const related = await this.getRelatedDevices(attachOn.value);
      const relatedAllActive = related.every(
        (it) => it.status === DeviceStatus.ACTIVE,
      );
      //await this.deviceModel.findOneAndUpdate(
      await this.notificationModel.findOneAndUpdate(
        {
          uri: attachOn.value,
        },
        {
          relatedStatus: relatedAllActive
            ? DeviceStatus.ACTIVE
            : DeviceStatus.ERROR,
        },
      );
    }

    const attachedDevices = (await this.getRelatedDevices(device.uri)) || [];
    // if without attached device
    if (attachedDevices.length === 0) {
      // return this.deviceModel.findOneAndUpdate(
      return this.notificationModel.findOneAndUpdate(
        { deviceId },
        {
          status,
          relatedStatus: DeviceStatus.ACTIVE,
        },
        {
          useFindAndModify: false,
        },
      );
    }

    // if has any attached device
    // return this.deviceModel.findOneAndUpdate(
    return this.notificationModel.findOneAndUpdate(
      { deviceId },
      {
        status,
      },
      {
        useFindAndModify: false,
      },
    );
  }

  //async getDeviceById(deviceId: string): Promise<Device> {
  async getDeviceById(deviceId: string): Promise<Notification> {
    return (
      //this.deviceModel
      this.notificationModel
        .findOne({
          deviceId,
        })
        .populate({ path: 'groups' })
        .populate({ path: 'sensors' })
    );
  }

  // async getDeviceByIds(deviceIds: string[]): Promise<Device[]> {
  async getDeviceByIds(deviceIds: string[]): Promise<Notification[]> {
    return (
      //this.deviceModel
      this.notificationModel
        .find({
          deviceId: { $in: deviceIds },
        })
        .populate({ path: 'groups' })
        .populate({ path: 'sensors' })
    );
  }

  //async getRelatedDevices(lampUri: string): Promise<Device[]> {
  async getRelatedDevices(lampUri: string): Promise<Notification[]> {
    return (
      //this.deviceModel
      this.notificationModel
        .find({
          $and: [
            {
              attributes: { $elemMatch: { key: Constants.KEY_ATTR_ATTACH_ON } },
            },
            { attributes: { $elemMatch: { value: lampUri } } },
          ],
        })
        .populate({ path: 'groups' })
        .populate({ path: 'sensors' })
    );
  }

  // async getAllDevices(): Promise<Device[]> {
  async getAllDevices(): Promise<Notification[]> {
    //return this.deviceModel.aggregate([
    return this.notificationModel.aggregate([
      {
        $lookup: {
          from: 'groups',
          localField: 'groups',
          foreignField: '_id',
          as: 'deviceInfos',
        },
      },
      {
        $project: {
          _id: 0,
          deviceId: 1,
          projectKey: '$deviceInfos.projectKey',
        },
      },
    ]);
  }

  async listenDevicesStatusChanged(
    //producer: ProducerService,
    pubSub: RedisPubSub,
    redisTopic: string,
    deviceIds: string[],
    projectKeys: string[],
  ): Promise<AsyncIterator<unknown>> {
    const inputs = new Map<string, string[]>();
    await Promise.all(
      deviceIds.flatMap(async (it) => {
        const projectKey = projectKeys[0];
        if (projectKey != null) {
          if (inputs.get(projectKey) === undefined) {
            inputs.set(projectKey, [it]);
          } else {
            inputs.get(projectKey).push(it);
          }
        }
      }),
    );

    const clients: MqttClient[] = [];

    inputs.forEach((values, projectKey) => {
      const client = connect(
        this.configService.get<string>('CHTIOT_MQTT_URI'),
        {
          username: projectKey,
          password: projectKey,
        },
      );

      client.on('connect', () => {
        values.forEach((deviceId) => {
          const topic = `/v1/device/${deviceId}/active`;
          client.subscribe(topic, { qos: 0 }, (error, _qos) => {
            if (error) {
              this.logger.error(`mqtt error: ${error.message}`);
            }
          });
        });
      });

      client.on('message', (mqttTopic, message) => {
        const data = JSON.parse(message.toString()) as MqttStatusResponse;

        this.logger.debug(
          `mqtt topic: ${mqttTopic}, received: ${JSON.stringify(data)}`,
        );

        try {
          const deviceStatusResponse = new DeviceStatusResponse();
          deviceStatusResponse.deviceId = data.deviceId;
          deviceStatusResponse.status = StringUtils.deviceStatusFrom(
            data.status,
          );
          deviceStatusResponse.time = new Date(data.createTime);

          if (deviceStatusResponse.deviceId !== undefined) {
            // alse update the status on cityos' database
            void this.updateDeviceStatus(
              deviceStatusResponse.deviceId,
              deviceStatusResponse.status,
            );
          }

          // const kafkaPaload = new KafkaPayload();
          // kafkaPaload.body = deviceStatusResponse;
          // kafkaPaload.messageId =  '' + new Date().valueOf().toString();
          // kafkaPaload.messageType = 'deviceStatus';
          // kafkaPaload.topicName = Constants.PREFIX_FOR_DEVICE_STATUS_TOPIC;

          // void producer.publish(redisTopic, kafkaPaload);

          void pubSub.publish(redisTopic, {
            devicesStatusChanged: deviceStatusResponse,
          });

          void this.sendNotification(data.deviceId, data.status);
        } catch (e) {}
      });

      clients.push(client);
    });
    // return;
    return withCancel(pubSub.asyncIterator(redisTopic), () => {
      this.logger.debug(
        `Subscription closed, try to end the mqtt for ${redisTopic}`,
      );
      clients.forEach((client) => client.end());
    });
  }

  async sendLineNotification(
    lineList: SendList,
    lang: Language,
  ): Promise<boolean> {
    this.logger.log(
      String().concat(
        `Send Line('notification'):`,
        lineList.deviceId,
        ',',
        lang,
      ),
    );

    // const lang_tmp = lang;

    // const deviceId = lineList.deviceId;
    // const name = lineList.name;
    // const content = lineList.emailContent;
    // const Title = lineList.emailTitle;
    // const LINEID = ''; //lineList.LINEID;

    return true;
  }

  async sendMailNotification(
    emailList: SendList,
    devicePreviousStatus: string,
    deviceCurrentStatus: DeviceStatus,
    lang: Language,
  ): Promise<boolean> {
    if ((emailList?.email || '') != '') {
      this.logger.log(
        String().concat(
          `Send mail('notification'): `,
          `deviceId:`,
          emailList?.deviceId || '',
          ', ',
          `deviceName:`,
          emailList?.devcieName || '',
          ', ',
          `PreviousStatus:`,
          devicePreviousStatus || '',
          ', ',
          `CurrentStatus:`,
          deviceCurrentStatus.toString() || '',
          ', ',
          `Title:`,
          emailList?.emailTitle || '',
          ', ',
          `email:`,
          emailList?.email || '',
        ),
      );

      return !!(await this.sendMail(
        emailList?.email || '',
        this.createSendMailOptions(emailList, deviceCurrentStatus, lang),
      ));
    }
  }

  private async sendMail(
    receiverMail: string,
    options: SendMailOptions,
  ): Promise<SMTPTransport.SentMessageInfo> {
    return this.mailTransport.sendMail({
      from: this.configService.get<string>('SMTP_MAIL_SERVER_DEFALUT_FROM'),
      to: receiverMail,
      ...options,
    });
  }

  private createSendMailOptions(
    emailList: SendList,
    currentStatus: DeviceStatus,
    lang: Language,
  ): SendMailOptions {
    //const locale = this.getLocale(lang);
    //const invite = {};
    const langTmp = lang;
    console.log(langTmp);
    const deviceId = emailList.deviceId;
    const deviceName = emailList.devcieName;
    const subject =
      currentStatus.toString().trim() === 'ERROR'
        ? (emailList?.emailTitle.trim() === ''
            ? 'CityOS - Device Abnormal Notification'
            : emailList?.emailTitle) || 'CityOS - Device Abnormal Notification'
        : (emailList?.emailTitle.trim() === ''
            ? 'CityOS - Device Recovery Notification'
            : emailList?.emailTitle) || 'CityOS - Device Recovery Notification';
    let message = '';
    const action = '';
    const link = '';
    const extra = '';
    const signature = '';
    const footer = '';
    const eventTime = new Date();

    const messageTemp = String().concat(
      'Device ID: ',
      deviceId,
      '\n',
      'Device Name: ',
      deviceName,
      '\n',
      'Device Status: ',
      currentStatus.toString(),
      '\n',
      'Event Time: ',
      String().concat(eventTime.toUTCString(), ' (UTC+0)'),
      '\n\n',
    );

    message = String().concat(messageTemp, '\n', emailList?.emailContent || '');

    return {
      ...this.renderMail({
        subject: StringUtils.nl2space(subject),
        message: message,
        action: action,
        link: link,
        extra: extra,
        signature: signature,
        footer: footer,
      }),
      subject: StringUtils.nl2space(subject),
    };
  }

  private renderMail({
    subject,
    message = '',
    action = '',
    link = '',
    extra = '',
    signature = '',
    footer = '',
  }: MailContent): SendMailOptions {
    const result = mjml2html({
      tagName: 'mjml',
      attributes: {},
      children: [
        {
          tagName: 'mj-head',
          attributes: {},
          children: [
            {
              tagName: 'mj-attributes',
              attributes: {},
              children: [
                {
                  tagName: 'mj-all',
                  attributes: {
                    'font-family': 'Roboto, Arial, Helvetica, sans-serif',
                  },
                },
              ],
            },
          ],
        },
        {
          tagName: 'mj-body',
          attributes: {},
          children: [
            {
              tagName: 'mj-wrapper',
              attributes: {},
              children: [
                {
                  tagName: 'mj-section',
                  attributes: {
                    padding: '0 0 48px',
                  },
                  children: [
                    {
                      tagName: 'mj-column',
                      attributes: {
                        padding: '0',
                      },
                      children: [
                        {
                          tagName: 'mj-image',
                          attributes: {
                            padding: '0',
                            width: '600px',
                            src: 'cid:logo',
                          },
                        },
                      ],
                    },
                  ],
                },
                {
                  tagName: 'mj-section',
                  attributes: {
                    padding: '0 50px',
                  },
                  children: [
                    {
                      tagName: 'mj-column',
                      attributes: {},
                      children: [
                        {
                          tagName: 'mj-text',
                          attributes: {
                            padding: '8px 0',
                            'font-size': '23px',
                            'font-weight': '700',
                            'line-height': '2',
                            align: 'center',
                          },
                          content: StringUtils.nl2br(subject),
                        },
                        {
                          tagName: 'mj-text',
                          attributes: {
                            padding: '0',
                            'font-size': '16px',
                            'line-height': '1.4',
                          },
                          content: StringUtils.nl2br(message),
                        },
                        link && action
                          ? {
                              tagName: 'mj-button',
                              attributes: {
                                padding: '40px 0',
                                'inner-padding': '16px 76px',
                                'font-size': '16px',
                                'line-height': '1.4',
                                color: '#FFF',
                                'background-color': '#25B2FF',
                                'border-radius': '8px',
                                href: link,
                                target: '_blank',
                                rel: 'noopener noreferrer',
                              },
                              content: StringUtils.nl2br(action),
                            }
                          : undefined,
                        {
                          tagName: 'mj-text',
                          attributes: {
                            padding: '0',
                            'font-size': '16px',
                            'line-height': '1.4',
                          },
                          content: StringUtils.nl2br(extra),
                        },
                        {
                          tagName: 'mj-text',
                          attributes: {
                            padding: '24px 0',
                            'font-size': '16px',
                            'font-weight': '700',
                          },
                          content: StringUtils.nl2br(signature),
                        },
                      ].filter((obj) => obj),
                    },
                  ],
                },
                {
                  tagName: 'mj-section',
                  attributes: {
                    padding: '48px 0 0',
                  },
                  children: [
                    {
                      tagName: 'mj-column',
                      attributes: {},
                      children: [
                        {
                          tagName: 'mj-divider',
                          attributes: {
                            padding: '8px 0',
                            'border-width': '1px',
                            'border-color': '#9EADBD',
                          },
                        },
                        {
                          tagName: 'mj-text',
                          attributes: {
                            padding: '24px 0',
                            'font-size': '16px',
                            'font-weight': '700',
                            align: 'center',
                            color: '#828282',
                          },
                          content: footer,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    return {
      html: result.html,
      attachments: [
        {
          filename: 'logo.png',
          path: 'data:image/png;base64,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',
          cid: 'logo',
        },
      ],
    };
  }

  async getNotificaionListbyType(
    deviceId: string,
    notifyType: string,
  ): Promise<SendList[]> {
    return this.DeviceModel.aggregate([
      { $match: { deviceId: deviceId } },
      {
        $lookup: {
          from: 'malfunctioning_device_notify_type',
          localField: 'type',
          foreignField: 'deviceType',
          as: 'NotificationType',
        },
      },
      { $unwind: '$NotificationType' },
      {
        $match: {
          'NotificationType.notifyType': notifyType,
          'NotificationType.status': 'ON',
        },
      },
      { $unwind: '$groups' },
      { $unwind: '$NotificationType.division_id' },
      {
        $match: {
          $expr: { $eq: ['$groups', '$NotificationType.division_id'] },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'NotificationType.division_id',
          foreignField: 'groups.group',
          as: 'NotificationStaff',
        },
      },
      { $unwind: '$NotificationStaff' },
      {
        $match: {
          'NotificationStaff.isMaintenance': true,
          'NotificationStaff.status': 'ACTIVE',
        },
      },
      {
        $group: {
          _id: {
            deviceId: '$deviceId',
            devcieName: '$name',
            devicePreviousStatus: '$status',
            userName: '$notificationStaff_name',
            email: '$NotificationStaff.email',
            lineId: '$NotificationStaff.lineId',
            phone: '$NotificationStaff.phone',
            emailTitle: '',
            emailContent: '',
            language: '$NotificationStaff.language',
          },
        },
      },
      {
        $project: {
          _id: 0,
          deviceId: '$_id.deviceId',
          devcieName: '$_id.devcieName',
          devicePreviousStatus: '$_id.devicePreviousStatus',
          userName: '$_id.userName',
          email: '$_id.email',
          lineId: '$_id.lineId',
          phone: '$_id.phone',
          emailTitle: '$_id.emailTitle',
          emailContent: '$_id.emailContent',
          language: '$_id.language',
        },
      },
    ]);
  }

  async getDeviceStatusInfo(deviceIdLocal: string): Promise<DeviceStatusInfo> {
    return this.deviceStatusInfoModel.findOne(
      { deviceId: deviceIdLocal },
      {
        _id: 1,
        id: 1,
        deviceId: 1,
        status: 1,
        previousStatus: 1,
        groupsLength: 1,
        createdAt: 1,
      },
    );
  }

  async updateStatusFromDeviceStatus(
    _idLocal: Types.ObjectId,
    currentStatusLocal: string,
    previousStatusLocal: string,
  ) {
    await this.deviceStatusInfoModel.findOneAndUpdate(
      { _id: _idLocal },
      {
        $set: {
          status: currentStatusLocal,
          previousStatus: previousStatusLocal,
          updatedAt: new Date(),
        },
      },
    );
  }

  async addDeviceStatusLog(
    deviceOIdLocal: Types.ObjectId,
    deviceIdLocal: string,
    statusLocal: string,
    previousStatusLocal: string,
    groupsLengthLocal: number,
    createdAtLocal: Date,
  ) {
    await this.deviceStatusInfoLogsModel.insertMany({
      _deviceOId: deviceOIdLocal,
      deviceId: deviceIdLocal,
      status: statusLocal,
      previousStatus: previousStatusLocal,
      groupsLength: groupsLengthLocal,
      createdAt: createdAtLocal,
      LogDateTime: new Date(),
    });
  }

  async addAllDeviceStatusLog() {
    const allDeviceStatusInfos = await this.deviceStatusInfoModel.find(
      {},
      {
        _id: 0,
        _deviceOId: '$_id',
        deviceId: 1,
        status: 1,
        previousStatus: 1,
        groupsLength: 1,
        createdAt: 1,
        LogDateTime: new Date(),
      },
    );
    await this.deviceStatusInfoLogsModel.insertMany(allDeviceStatusInfos);
  }

  async addEmailNotificationLog(
    deviceIdLocal: string,
    deviceNameLocal: string,
    userNameLocal: string,
    previousStatusLocal: string,
    currentStatusLocal: DeviceStatus,
    emailLocal: string,
    emailTitleLocal: string,
    emailContentLocal: string,
  ) {
    await this.emailNotificationLogsModel.insertMany({
      deviceId: deviceIdLocal,
      name: deviceNameLocal,
      userName: userNameLocal,
      previousStatus: previousStatusLocal,
      currentStatus: currentStatusLocal.toString().trim(),
      email: emailLocal,
      emailTitle: emailTitleLocal,
      emailContent: emailContentLocal,
      createdAt: new Date(),
    });
  }
}
