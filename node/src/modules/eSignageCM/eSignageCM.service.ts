/* eslint-disable @typescript-eslint/no-unused-vars */
import { DeviceService } from '../device/device.service';
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { DateTime, IANAZone } from 'luxon';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { ConfigService } from '@nestjs/config';
import { GoogleClientService } from '../google-client/google-client/google-client.service';
import { ESignageCMRepository } from './eSignageCM.repository';
import {
  DeviceConnection,
  DeviceFilter,
  DeviceType,
  DivisionOutput,
  EmergencyCallInput,
  Filter,
  GetCity,
  GetMediaPool,
  GetContentType,
  GetDivision,
  GetEsignageTemplateType,
  GetLanguage,
  GetTemplate,
  GetTemplateContent,
  GetWeatherStyle,
  IpCam,
  IpCamDetail,
  Media,
  TemplateContent,
  TemplateInput,
  TPContent,
  TPContentDetail,
  UpdateTemplateContentInput,
  UpdateTemplateInput,
  User,
  Weather,
  WeatherDeatail,
  Webpage,
  WebpageDetail,
  GetPlayerData,
  PlayerDataOutput,
  MediaDetail,
  TemplateScheduleInput,
  GetTemplateSchedule,
  PublishScheduleInput,
  PublishScheduleRes,
  ScheduleApiModel,
  GetWeatherData,
  WeatherDataError,
  GetTemplateLogs,
} from 'src/graphql.schema';
import { EsignageTemplateType } from 'src/models/esignage.template.type';
import { EsignageResolution } from 'src/models/esignage.resolution';
import { ApolloError, ForbiddenError } from 'apollo-server-express';
import { ErrorCode } from 'src/models/error.code';
import { EsignageTemplate } from 'src/models/esignage.template';
import { now, Types } from 'mongoose';
import { EsignageTemplateContent } from 'src/models/esignage.template.content';
import { EsignageWeather } from 'src/models/esignage.weather';
import { EsignageMediaPool } from 'src/models/esignage.media.pool';
import { HtmlStripCharFilter, Id } from '@elastic/elasticsearch/api/types';
import { EsignageWebpage } from 'src/models/esignage.webpage';
import { EsignageIpcam } from 'src/models/esignage.ipcam';
import { EsignageTemplateLogs } from 'src/models/esignage.template.logs';
import { EsignageTemplateContentLogs } from 'src/models/esignage.template.content.logs';
import { EsignageTemplateContentDetail } from 'src/models/esignage.template.content.detail';
import { EsignageTemplateContentDetailLogs } from 'src/models/esignage.template.content.detail.logs';
import { ObjectId } from 'mongodb';
import { ChtiotClientService } from '../chtiot-client/chtiot-client.service';
import { HttpService } from '@nestjs/axios';
import { EsignageSchedule } from 'src/models/esignage.schedule';
import {
  EsignageSchedulePublishPlayersLogs,
  EsignageSchedulePublishPlayersLogsSchema,
} from 'src/models/esignage.schedule.publish.players.log';
import { EsignageScheduleLogs } from 'src/models/esignage.schedule.logs';
import { ImageMgmtService } from '../image-mgmt/image-mgmt.service';
import Handlebars from 'handlebars';
import fs from 'fs';

interface CMSTokenRes {
  success: string;
  statusCode: number;
  message: string;
  payload: string;
}

interface CMSPlayerRes {
  success: boolean;
  statusCode: number;
  message: string;
  payload: PlayerPayload;
}

interface PlayerPayload {
  version: string;
  status: string;
  lastConnectionTime: string;
  companyName: string;
  groupName: string;
  serviceStartDate: string;
  serviceEndDate: string;
  id: string;
  name: string;
}
interface PlayerResponse {
  id: string;
  deviceId: string;
  time: Date;
  value: string[];
}

@Injectable()
export class ESignageCMService {
  constructor(
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @Inject(forwardRef(() => DeviceService))
    private deviceService: DeviceService,
    @Inject(forwardRef(() => GroupService))
    private groupService: GroupService,
    private chtiotClientService: ChtiotClientService,
    private httpService: HttpService,
    private configService: ConfigService,
    private readonly imageMgmtService: ImageMgmtService,
    private googleClientService: GoogleClientService,
    private eSignageCMRepository: ESignageCMRepository,
  ) {}

  /**
   * check  parameter zone
   */
  async checkTemplateQueryInput(
    groupId: string,
    page: number,
  ): Promise<boolean> {
    //檢查資料
    if (groupId == null || groupId.length == 0) {
      return false;
    }
    if (page == 0) {
      return false;
    }
    return true;
  }

  async checkTemplateInput(template: TemplateInput): Promise<boolean> {
    //檢查資料
    if (template === null) {
      return false;
    }
    if (
      template.name === null ||
      template.templateTypeId === null ||
      template.description === null ||
      template.templateContent === null
    ) {
      return false;
    }
    return true;
  }

  async checkUpdateTemplateInput(
    template: UpdateTemplateInput,
  ): Promise<boolean> {
    //檢查資料
    if (template === null) {
      return false;
    }
    if (
      template.name === null ||
      template.templateTypeId === null ||
      template.description === null ||
      template.group === null
    ) {
      return false;
    }
    return true;
  }

  async checkUpdateTemplateContentInput(
    template: UpdateTemplateContentInput,
  ): Promise<boolean> {
    //檢查資料
    if (template === null) {
      return false;
    }
    return true;
  }

  async checkScheduleInput(
    scheduleInput: TemplateScheduleInput,
  ): Promise<boolean> {
    //檢查資料
    if (scheduleInput === null) {
      return false;
    }
    if (
      scheduleInput.templateId === null ||
      scheduleInput.scheduleName === null ||
      scheduleInput.playStartDate === null ||
      scheduleInput.playStartTime === null ||
      scheduleInput.playEndTime === null ||
      scheduleInput.loopMode === null ||
      scheduleInput.audioSetting === null ||
      scheduleInput.downloadDirectly === null
    ) {
      return false;
    }
    return true;
  }

  async checkdeleteScheduleInput(templateScheduleId: string): Promise<boolean> {
    //檢查資料
    if (templateScheduleId === null || templateScheduleId == undefined) {
      return false;
    }
    return true;
  }

  /**
   * Query Zone
   */
  async getDivision(groupId: string, filter: Filter): Promise<GetDivision> {
    const division = await this.eSignageCMRepository.getDivision(groupId);
    const totalCount = division.length;
    const newList = new GetDivision();
    newList.divisionOutput = division;
    newList.totalCount = totalCount;
    return newList;
  }

  async getTemplateType(
    page: number,
    pageSize: number,
    filter: Filter,
  ): Promise<GetEsignageTemplateType> {
    const totalCount = await this.eSignageCMRepository.getTemplateTypeCount();
    if (totalCount == 0) {
      throw new ApolloError(
        `ESignage template is empty`,
        ErrorCode.ESIGNAGNE_TEMPLATE_EMPTY,
      );
    }
    if (pageSize == null || pageSize == 0) {
      pageSize = totalCount;
    }
    const typeList = await this.eSignageCMRepository.getTemplateType(
      page,
      pageSize,
      filter,
    );
    const newList = new GetEsignageTemplateType();
    newList.esignageTemplateTypeOutput = typeList;
    newList.totalCount = totalCount;
    return newList;
  }

  async getWeatherStyle(
    page: number,
    pageSize: number,
  ): Promise<GetWeatherStyle> {
    const totalCount = await this.eSignageCMRepository.getWeatherStyleCount();
    if (totalCount == 0) {
      throw new ApolloError(
        `ESignage template is empty`,
        ErrorCode.ESIGNAGNE_TEMPLATE_EMPTY,
      );
    }
    if (pageSize == null || pageSize == 0) {
      pageSize = totalCount;
    }
    const styleList = await this.eSignageCMRepository.getWeatherStyle(
      page,
      pageSize,
    );
    const weatherStyleList = new GetWeatherStyle();
    weatherStyleList.weatherStyleOutput = styleList;
    weatherStyleList.totalCount = totalCount;
    return weatherStyleList;
  }

  async getLanguage(page: number, pageSize: number): Promise<GetLanguage> {
    const totalCount = await this.eSignageCMRepository.getLanguageCount();
    if (totalCount == 0) {
      throw new ApolloError(
        `ESignage template is empty`,
        ErrorCode.ESIGNAGNE_TEMPLATE_EMPTY,
      );
    }
    if (pageSize == null || pageSize == 0) {
      pageSize = totalCount;
    }
    const styleList = await this.eSignageCMRepository.getLanguageCode(
      page,
      pageSize,
    );
    const languageCodeList = new GetLanguage();
    languageCodeList.languageOutput = styleList;
    languageCodeList.totalCount = totalCount;
    return languageCodeList;
  }

  async getCity(page: number, pageSize: number): Promise<GetCity> {
    const totalCount = await this.eSignageCMRepository.getCityCount();
    if (totalCount == 0) {
      throw new ApolloError(
        `ESignage template is empty`,
        ErrorCode.ESIGNAGNE_TEMPLATE_EMPTY,
      );
    }
    if (pageSize == null || pageSize == 0) {
      pageSize = totalCount;
    }
    const styleList = await this.eSignageCMRepository.getCity(page, pageSize);
    const cityList = new GetCity();
    cityList.cityOutput = styleList;
    cityList.totalCount = totalCount;
    return cityList;
  }

  async getMediaPool(
    userId: ObjectId,
    page: number,
    pageSize: number,
  ): Promise<GetMediaPool> {
    const totalCount = await this.eSignageCMRepository.getMediaPoolCount(
      userId,
    );
    if (pageSize == null || pageSize == 0) {
      pageSize = totalCount;
    }
    const styleList = await this.eSignageCMRepository.getMediaPool(
      userId,
      page,
      pageSize,
    );
    const mediaPoolList = new GetMediaPool();
    mediaPoolList.mediaPoolOutput = styleList;
    mediaPoolList.totalCount = styleList.length;
    return mediaPoolList;
  }

  async getContentType(
    page: number,
    pageSize: number,
  ): Promise<GetContentType> {
    const totalCount = await this.eSignageCMRepository.getContentTypeCount();
    if (totalCount == 0) {
      throw new ApolloError(
        `ESignage template is empty`,
        ErrorCode.ESIGNAGNE_TEMPLATE_EMPTY,
      );
    }
    if (pageSize == null || pageSize == 0) {
      pageSize = totalCount;
    }
    const List = await this.eSignageCMRepository.getContentType(page, pageSize);
    const CTList = new GetContentType();
    CTList.contentTypeOutput = List;
    CTList.totalCount = totalCount;
    return CTList;
  }

  async getTemplate(
    groupId: string,
    page: number,
    pageSize: number,
    filter: Filter,
  ): Promise<GetTemplate> {
    const totalCount = await this.eSignageCMRepository.getTemplateCount(
      groupId,
    );
    if (!totalCount) {
      const newList = new GetTemplate();
      newList.templateOutput = [];
      newList.totalCount = 0;
      return newList;
    }
    if (pageSize == null || pageSize == 0 || pageSize == undefined) {
      pageSize = totalCount;
    }
    const typeList = await this.eSignageCMRepository.getTemplate(
      groupId,
      page,
      pageSize,
      filter,
    );
    const newList = new GetTemplate();
    newList.templateOutput = typeList;
    newList.totalCount = totalCount;
    return newList;
  }

  async getTemplateLogs(
    groupId: string,
    page: number,
    pageSize: number,
    filter: Filter,
  ): Promise<GetTemplateLogs> {
    const totalCount = await this.eSignageCMRepository.getTemplateLogsCount(
      groupId,
    );
    if (!totalCount) {
      const newList = new GetTemplateLogs();
      newList.templateLogsOutput = [];
      newList.totalCount = 0;
      return newList;
    }
    if (pageSize == null || pageSize == 0 || pageSize == undefined) {
      pageSize = totalCount;
    }
    const typeList = await this.eSignageCMRepository.getTemplateLogs(
      groupId,
      page,
      pageSize,
      filter,
    );
    const newList = new GetTemplateLogs();
    newList.templateLogsOutput = typeList;
    newList.totalCount = totalCount;
    return newList;
  }

  async getTemplateContent(templateId: string): Promise<GetTemplateContent> {
    const templateInterface = new GetTemplateContent();
    const template: EsignageTemplate =
      await this.eSignageCMRepository.getTemplateContent(templateId);
    templateInterface.id = template._id.toString();
    templateInterface.name = template.name;
    templateInterface.templateTypeId = template.templateTypeId.toString();
    templateInterface.description = template.description;
    templateInterface.group = template.group.toString();
    const tpList = await this.getContentByTemplateId(templateId);
    templateInterface.templateContent = tpList;
    console.log(templateInterface);
    return templateInterface;
  }

  async getContentByTemplateId(templateId: string): Promise<TPContent[]> {
    const tPContentList: TPContent[] = [];
    const templateContent =
      await this.eSignageCMRepository.getContentByTemplateId(templateId);
    for (const t of templateContent) {
      const tpContent = new TPContent();
      tpContent.contentId = t._id.toString();
      tpContent.templateId = t.templateId.toString();
      tpContent.contentTypeId = t.contentTypeId.toString();
      tpContent.contentName = t.contentName;
      tpContent.tag = t.tag ?? 'null';
      tpContent.x = t.x;
      tpContent.y = t.y;
      tpContent.width = t.width;
      tpContent.height = t.height;
      tpContent.rectId = t.rectId;
      const detail = await this.getContentDetailByContentId(
        tpContent.contentId,
      );
      tpContent.templateContentDetail = detail;
      tPContentList.push(tpContent);
      console.log(tpContent);
    }
    return tPContentList;
  }

  async getContentDetailByContentId(
    contentId: string,
  ): Promise<TPContentDetail> {
    const res = new TPContentDetail();
    const contentDetail =
      await this.eSignageCMRepository.getContentDetailByContentId(contentId);
    console.log(contentDetail);
    if (contentDetail.weatherId) {
      const weatherDetail = await this.getWeatherDetailByWeatherId(
        contentDetail.weatherId.toString(),
      );
      res.weather = weatherDetail;
    }
    if (contentDetail.mediaIds.length > 0) {
      const mediaIds = contentDetail.mediaIds.flatMap((it) => it.toString());
      const mediaList = await this.getMediaDetailByMediaId(mediaIds);
      res.media = mediaList;
    }
    if (contentDetail.webPageIds.length > 0) {
      const webpageIds = contentDetail.webPageIds.flatMap((it) =>
        it.toString(),
      );
      const webPageList = await this.getWebpageDetailByWebpageId(webpageIds);
      res.webpage = webPageList;
    }
    if (contentDetail.camIds.length > 0) {
      const camIds = contentDetail.camIds.flatMap((it) => it.toString());
      const camList = await this.getCamDetailByCamId(camIds);
      res.cam = camList;
    }
    return res;
  }

  async getWeatherDetailByWeatherId(
    weatherId: string,
  ): Promise<WeatherDeatail> {
    const weather = new WeatherDeatail();
    const weatherDetail =
      await this.eSignageCMRepository.getWeatherDetailByWeatherId(weatherId);
    weather.id = weatherDetail.id;
    weather.weatherStyleId = weatherDetail.weatherStyleId.toString();
    weather.temperatureUnit = weatherDetail.temperatureUnit;
    weather.windSpeedUnit = weatherDetail.windSpeedUnit;
    weather.languageId = weatherDetail.languageId.toString();
    weather.backgroundColor = weatherDetail.backgroundColor;
    weather.durations = weatherDetail.durations;
    weather.citys = weatherDetail.citys;
    return weather;
  }

  async getMediaDetailByMediaId(mediaIds: string[]): Promise<MediaDetail[]> {
    const mediaList: MediaDetail[] = [];
    for (const mId of mediaIds) {
      const media = new MediaDetail();
      const mDetail = await this.eSignageCMRepository.getMediaDetailByMediaId(
        mId,
      );
      const mDetailbyUpdateImage =
        await this.eSignageCMRepository.getMediaByUploadImageId(
          mDetail.mediaId,
        );
      media.id = mDetail.id;
      media.mediaId = mDetail.mediaId.toString();
      media.imagePlayDurations = mDetail.imagePlayDurations;
      media.originalname = mDetailbyUpdateImage.originalname;
      media.size = mDetailbyUpdateImage.size;
      mediaList.push(media);
    }
    return mediaList;
  }

  async getWebpageDetailByWebpageId(
    webPageIds: string[],
  ): Promise<WebpageDetail[]> {
    const webPageList: WebpageDetail[] = [];
    for (const wId of webPageIds) {
      const webPage = new WebpageDetail();
      const webDetail =
        await this.eSignageCMRepository.getWebpageDetailByWebpageId(wId);
      webPage.id = webDetail.id;
      webPage.webUrl = webDetail.webUrl;
      webPage.playTime = webDetail.playTime;
      webPageList.push(webPage);
    }
    return webPageList;
  }

  async getCamDetailByCamId(camIds: string[]): Promise<IpCamDetail[]> {
    const camList: IpCamDetail[] = [];
    for (const cId of camIds) {
      const ipCam = new IpCamDetail();
      const cam = await this.eSignageCMRepository.getCamDetailByCamId(cId);
      ipCam.id = cam.id;
      ipCam.camName = cam.camName;
      ipCam.rtspUrl = cam.rtspUrl;
      ipCam.durations = cam.durations;
      camList.push(ipCam);
    }
    return camList;
  }

  async getPlayerData(
    projectKey: string,
    groupId: string,
    size: number,
    after: string,
    before: string,
  ): Promise<GetPlayerData> {
    const cmsToken = await this.getCMSToken(
      'issl-user',
      'issl-user33cc4ca',
      'zh-TW',
    );
    const filter = new DeviceFilter();
    filter.type = DeviceType.DISPLAY;
    const ret = await this.deviceService.searchDevices(
      groupId,
      filter,
      size,
      after,
      before,
    );
    if (!cmsToken || !ret) {
      const resPlayerData = new GetPlayerData();
      resPlayerData.playerDataOutput = [];
      resPlayerData.totalCount = 0;
      return resPlayerData;
    }

    const playerList: PlayerDataOutput[] = [];
    if (ret.edges.length > 0) {
      for (const player of ret.edges) {
        const playerDeviceId = player.node.deviceId;
        if (projectKey === undefined) {
          for (const group of player.node.groups) {
            const groupRes = await this.groupService.getGroup(group.id);
            if (groupRes.projectKey) {
              projectKey = groupRes.projectKey;
            }
          }
        }
        console.log('iotProjectKey:' + projectKey + 'id:' + playerDeviceId);
        //TODO: device.eSignageName 有值跳過IOT
        const playerNameRes: PlayerResponse =
          await this.chtiotClientService.getPlayerName(
            projectKey,
            playerDeviceId,
          );
        const playerName = playerNameRes.value[0];
        if (playerName !== null || playerName !== '') {
          const singlePlayer: CMSPlayerRes = await this.getSinglePlayer(
            cmsToken,
            playerName,
          );
          if (singlePlayer.payload !== null) {
            const endDate = singlePlayer.payload.serviceEndDate;
            const [dateValues, timeValues] = endDate.split(' ');
            const [year, month, day] = dateValues.split('/');
            const [hours, minutes, seconds] = timeValues.split(':');
            const date = new Date(
              +year,
              +month - 1,
              +day,
              +hours,
              +minutes,
              +seconds,
            ).toISOString();
            const isodate = new Date().toISOString();
            if (date > isodate) {
              console.log('未到期');
              const resPlayer = new PlayerDataOutput();
              resPlayer.id = player.node.id;
              resPlayer.deviceId = player.node.deviceId;
              resPlayer.type = player.node.type;
              resPlayer.name = player.node.name;
              resPlayer.desc = player.node.desc;
              resPlayer.playerName = playerName;
              resPlayer.serviceStartDate =
                singlePlayer.payload.serviceStartDate;
              resPlayer.serviceEndDate = singlePlayer.payload.serviceEndDate;
              playerList.push(resPlayer);
            }
          }
        }

        console.log('---playerList:', playerList);
      }
    }
    const resPlayerData = new GetPlayerData();
    resPlayerData.playerDataOutput = playerList;
    resPlayerData.totalCount = playerList.length;
    return resPlayerData;
  }

  async getSinglePlayer(
    token: string,
    playerId: string,
  ): Promise<CMSPlayerRes> {
    const options = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };

    const CMSresponse = await this.httpService
      .get(
        `https://cms.chtiss.com/CHT_API/players/singlePlayer?playerID=${playerId}`,
        options,
      )
      .toPromise()
      .then((res: AxiosResponse<CMSPlayerRes>) => res.data)
      .catch((error: AxiosError<CMSPlayerRes>) => {
        if (error && error?.response) {
          const errMessageDate = error.response.data;
          const errorMessage: CMSPlayerRes = {
            success: errMessageDate.success,
            statusCode: errMessageDate.statusCode,
            message: errMessageDate.message,
            payload: errMessageDate.payload,
          };
          return errorMessage;
        }
      });
    return CMSresponse;
  }

  async getCMSToken(
    userAccount: string,
    userPassword: string,
    locale: string,
  ): Promise<string> {
    const data = JSON.stringify({
      userAccount: userAccount,
      userPassword: userPassword,
      locale: locale,
    });
    const options = {
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
    };

    const CMSresponse = await this.httpService
      .post(`https://cms.chtiss.com/CHT_API/token`, data, options)
      .toPromise()
      .then((res: AxiosResponse<CMSTokenRes>) => res.data)
      .catch((error: AxiosError<CMSTokenRes>) => {
        throw new ApolloError(
          `Get token from IOT with error: ${error.response?.data?.message}.`,
          ErrorCode.CMS_API_ERROR,
        );
      });
    return CMSresponse.payload;
  }

  async getTemplateSchedule(
    templateId: string,
    page: number,
    pageSize: number,
    _filter: Filter,
  ): Promise<GetTemplateSchedule> {
    const totalCount =
      await this.eSignageCMRepository.getTemplateScheduleCount();
    if (pageSize == null || pageSize == 0) {
      pageSize = totalCount;
    }
    const list = await this.eSignageCMRepository.getTemplateSchedule(
      new Types.ObjectId(templateId),
      page,
      pageSize,
    );
    const scheduleList = new GetTemplateSchedule();
    scheduleList.templateScheduleOutput = list;
    scheduleList.totalCount = list.length;
    return scheduleList;
  }

  /**
   * mutation zone
   */
  async addTemplate(
    groupId: string,
    userId: string,
    templateInput: TemplateInput,
  ): Promise<string> {
    const templateId = await this.createTemplate(groupId, templateInput);
    const templateLogsId = await this.createTemplateLogs(
      userId,
      groupId,
      templateId,
      templateInput,
      'ADD',
    );
    //for each content and create template_content
    for (const content of templateInput.templateContent) {
      const templateContentId = await this.createTemplateContent(
        content,
        templateId,
      );
      const contentLogId = await this.createTemplateContentLogs(
        templateId,
        content,
        templateLogsId,
      );
      if (content.contentDeatail.weather) {
        console.log('weather not empty, create weather data.');
        const weatherId = await this.createWeather(content);
        //write Template Content Detail
        const contentDetail = new EsignageTemplateContentDetail();
        contentDetail.contentId = new Types.ObjectId(templateContentId);
        contentDetail.weatherId = new Types.ObjectId(weatherId);
        await this.eSignageCMRepository.addTemplateContentDetail(contentDetail);
        const contentDetailLogs = new EsignageTemplateContentDetailLogs();
        contentDetailLogs.contentId = new Types.ObjectId(templateContentId);
        contentDetailLogs.weatherId = new Types.ObjectId(weatherId);
        contentDetailLogs.logsId = new Types.ObjectId(templateLogsId);
        await this.eSignageCMRepository.addTemplateContentDetailLogs(
          contentDetailLogs,
        );
        //end write Template Content Detail
      }
      if (content.contentDeatail.ipCam) {
        console.log('ipCam not empty, create ipCam data.');
        const ipCamIdList: string[] = [];
        for (const m of content.contentDeatail.ipCam) {
          const ipCamId = await this.createIpCam(m);
          ipCamIdList.push(ipCamId);
        }
        console.log('--ipCamIdList:', ipCamIdList);
        //write Template Content Detail
        const contentDetail = new EsignageTemplateContentDetail();
        contentDetail.weatherId = null;
        contentDetail.contentId = new Types.ObjectId(templateContentId);
        contentDetail.camIds = ipCamIdList.flatMap(
          (it) => new Types.ObjectId(it),
        );
        await this.eSignageCMRepository.addTemplateContentDetail(contentDetail);
        const contentDetailLogs = new EsignageTemplateContentDetailLogs();
        contentDetailLogs.contentId = new Types.ObjectId(templateContentId);
        contentDetailLogs.camIds = ipCamIdList.flatMap(
          (it) => new Types.ObjectId(it),
        );
        contentDetailLogs.logsId = new Types.ObjectId(templateLogsId);
        await this.eSignageCMRepository.addTemplateContentDetailLogs(
          contentDetailLogs,
        );
        //end write Template Content Detail
      }
      if (content.contentDeatail.webpage) {
        console.log('webpage not empty, create webpage data.');
        const webPageIdList: string[] = [];
        for (const m of content.contentDeatail.webpage) {
          const webPageId = await this.createWebPage(m);
          webPageIdList.push(webPageId);
        }
        console.log(webPageIdList);
        //write Template Content Detail
        const contentDetail = new EsignageTemplateContentDetail();
        contentDetail.weatherId = null;
        contentDetail.contentId = new Types.ObjectId(templateContentId);
        contentDetail.webPageIds = webPageIdList.flatMap(
          (it) => new Types.ObjectId(it),
        );
        await this.eSignageCMRepository.addTemplateContentDetail(contentDetail);
        const contentDetailLogs = new EsignageTemplateContentDetailLogs();
        contentDetailLogs.contentId = new Types.ObjectId(templateContentId);
        contentDetailLogs.webPageIds = webPageIdList.flatMap(
          (it) => new Types.ObjectId(it),
        );
        contentDetailLogs.logsId = new Types.ObjectId(templateLogsId);
        await this.eSignageCMRepository.addTemplateContentDetailLogs(
          contentDetailLogs,
        );
        //end write Template Content Detail
      }
      if (content.contentDeatail.media) {
        console.log('media not empty, create media data.');
        const mediaIdList: string[] = [];
        for (const m of content.contentDeatail.media) {
          const mediaId = await this.createMedia(m, userId, templateId);
          mediaIdList.push(mediaId);
        }
        console.log(mediaIdList);
        //write Template Content Detail
        const contentDetail = new EsignageTemplateContentDetail();
        contentDetail.weatherId = null;
        contentDetail.contentId = new Types.ObjectId(templateContentId);
        contentDetail.mediaIds = mediaIdList.flatMap(
          (it) => new Types.ObjectId(it),
        );
        await this.eSignageCMRepository.addTemplateContentDetail(contentDetail);
        const contentDetailLogs = new EsignageTemplateContentDetailLogs();
        contentDetailLogs.contentId = new Types.ObjectId(templateContentId);
        contentDetailLogs.mediaIds = mediaIdList.flatMap(
          (it) => new Types.ObjectId(it),
        );
        contentDetailLogs.logsId = new Types.ObjectId(templateLogsId);
        await this.eSignageCMRepository.addTemplateContentDetailLogs(
          contentDetailLogs,
        );
        //end write Template Content Detail
      }
    }
    // await this.eSignageCMRepository.deleteTemplate(templateId);
    return templateId;
  }

  async updateTemplate(
    groupId: string,
    userId: Id,
    templateId: string,
    templateInput: UpdateTemplateInput,
  ): Promise<boolean> {
    await this.eSignageCMRepository.updateTemplate(templateId, templateInput);
    return true;
  }

  async updateTemplateContent(
    groupId: string,
    templateId: string,
    userId: string,
    templateContent: UpdateTemplateContentInput,
  ): Promise<boolean> {
    for (const content of templateContent.updateTemplateContent) {
      await this.eSignageCMRepository.updateTemplateContent(
        content.contentId,
        content,
      );
      if (content.contentDeatail.weather) {
        console.log('weather not empty, create weather data.');
        const weatherId = await this.createWeather(content);
        await this.eSignageCMRepository.updateTemplateContentDetailByWeather(
          content.contentId,
          weatherId,
        );
      }
      if (content.contentDeatail.ipCam) {
        console.log('ipCam not empty, create ipCam data.');
        const ipCamIdList: string[] = [];
        if (
          content.contentDeatail.ipCam[0].camName === '' &&
          content.contentDeatail.ipCam[0].rtspUrl === '' &&
          content.contentDeatail.ipCam[0].durations === -1
        ) {
          await this.eSignageCMRepository.updateTemplateContentDetailByIpcam(
            content.contentId,
            ipCamIdList,
          );
        } else {
          for (const m of content.contentDeatail.ipCam) {
            const ipCamId = await this.createIpCam(m);
            ipCamIdList.push(ipCamId);
          }
          await this.eSignageCMRepository.updateTemplateContentDetailByIpcam(
            content.contentId,
            ipCamIdList,
          );
        }
      }
      if (content.contentDeatail.webpage) {
        console.log('webpage not empty, create webpage data.');
        const webPageIdList: string[] = [];
        if (
          content.contentDeatail.webpage[0].webUrl === '' &&
          content.contentDeatail.webpage[0].playTime === -1
        ) {
          await this.eSignageCMRepository.updateTemplateContentDetailByWebpage(
            content.contentId,
            webPageIdList,
          );
        } else {
          for (const m of content.contentDeatail.webpage) {
            const webPageId = await this.createWebPage(m);
            webPageIdList.push(webPageId);
          }
          await this.eSignageCMRepository.updateTemplateContentDetailByWebpage(
            content.contentId,
            webPageIdList,
          );
        }
      }
      if (content.contentDeatail.media) {
        console.log('media not empty, create media data.');
        const mediaIdList: string[] = [];
        if (
          content.contentDeatail.media[0].mediaId === '' &&
          content.contentDeatail.media[0].imagePlayDurations === -1
        ) {
          await this.eSignageCMRepository.updateTemplateContentDetailByMedia(
            content.contentId,
            mediaIdList,
          );
        } else {
          for (const m of content.contentDeatail.media) {
            const mediaId = await this.createMedia(m, userId, templateId);
            mediaIdList.push(mediaId);
          }
          await this.eSignageCMRepository.updateTemplateContentDetailByMedia(
            content.contentId,
            mediaIdList,
          );
        }
      }
    }
    return true;
  }

  async deleteTemplate(
    groupId: string,
    userId: Id,
    templateId: string,
  ): Promise<boolean> {
    const template = new TemplateInput();
    const templateText =
      await this.eSignageCMRepository.getTemplateByTemplateId(
        new Types.ObjectId(templateId),
      );
    if (!templateText) {
      throw new ApolloError(
        `TemplateId is not exist.`,
        ErrorCode.ESIGNAGNE_TEMPLATE_IS_NOT_EXIST,
      );
    }
    template.name = templateText.name;
    template.templateTypeId = templateText.templateTypeId.toString();
    template.backgroundColor = templateText.backgroundColor;
    template.description = templateText.description;

    await this.createTemplateLogs(
      userId,
      groupId,
      templateId,
      template,
      'DELETE',
    );

    const tcList = await this.eSignageCMRepository.getContentByTemplateId(
      templateId,
    );
    for (const tc of tcList) {
      const cid = tc._id.toString();
      const detail =
        await this.eSignageCMRepository.getContentDetailByContentId(cid);
      if (detail) {
        const detailId = detail._id;
        if (detail.weatherId) {
          //刪除weather
          console.log(detail.weatherId.toString());
          await this.eSignageCMRepository.deleteWeather(detail.weatherId);
        }
        if (detail.mediaIds.length > 0) {
          for (const mId of detail.mediaIds) {
            await this.eSignageCMRepository.deleteMedia(mId);
          }
        }
        if (detail.webPageIds.length > 0) {
          for (const wId of detail.webPageIds) {
            await this.eSignageCMRepository.deleteMedia(wId);
          }
        }
        if (detail.camIds.length > 0) {
          for (const cId of detail.camIds) {
            await this.eSignageCMRepository.deleteIpCam(cId);
          }
        }
        await this.eSignageCMRepository.deleteContentDetail(detailId);
      }
      await this.eSignageCMRepository.deleteContent(tc._id);
    }
    await this.eSignageCMRepository.deleteTemplate(
      new Types.ObjectId(templateId),
    );

    const [schedule] = await this.eSignageCMRepository.getTemplateSchedule(
      new Types.ObjectId(templateId),
      1,
      10,
    );
    console.log([schedule]);
    console.log([schedule].length);
    if (schedule !== undefined) {
      await this.deleteTemplateSchedule(schedule.scheduleId);
    }
    return true;
  }

  async createTemplate(
    groupId: string,
    templateInput: TemplateInput,
  ): Promise<string> {
    const eSignageTemplateData = new EsignageTemplate();
    eSignageTemplateData.name = templateInput.name;
    eSignageTemplateData.description = templateInput.description;
    eSignageTemplateData.templateTypeId = new Types.ObjectId(
      templateInput.templateTypeId,
    );
    eSignageTemplateData.backgroundColor = templateInput.backgroundColor;
    eSignageTemplateData.group = new Types.ObjectId(templateInput.group);
    //回傳template.id
    const templateId = await this.eSignageCMRepository.addTemplate(
      eSignageTemplateData,
    );
    if (templateId === null || templateId == undefined) {
      throw new ApolloError(
        `ADD ESignage template faile`,
        ErrorCode.ESIGNAGNE_ADD_TEMPLATE_FAILE,
      );
    }
    console.log('Template ID:', templateId);
    return templateId;
  }

  async createTemplateLogs(
    userId: Id,
    groupId: string,
    templateId: string,
    templateInput: TemplateInput,
    memo: string,
  ): Promise<string> {
    const templateLogs = new EsignageTemplateLogs();
    templateLogs.templateId = new Types.ObjectId(templateId);
    templateLogs.name = templateInput.name;
    templateLogs.templateTypeId = new Types.ObjectId(
      templateInput.templateTypeId,
    );
    templateLogs.description = templateInput.description;
    templateLogs.backgroundColor = templateInput.backgroundColor;
    templateLogs.group = new Types.ObjectId(groupId);
    templateLogs.userId = new Types.ObjectId(userId);
    templateLogs.memo = memo;
    templateLogs.status = 1;
    const logsId = await this.eSignageCMRepository.addTemplateLogs(
      templateLogs,
    );
    return logsId;
  }

  async createTemplateContent(
    content: TemplateContent,
    templateId: string,
  ): Promise<string> {
    const templateContent = new EsignageTemplateContent();
    templateContent.templateId = new Types.ObjectId(templateId);
    templateContent.contentTypeId = new Types.ObjectId(content.contentTypeId);
    templateContent.contentName = content.contentName;
    templateContent.tag = content.tag ?? null;
    templateContent.x = content.x ?? null;
    templateContent.y = content.y ?? null;
    templateContent.width = content.width ?? null;
    templateContent.height = content.height ?? null;
    templateContent.rectId = content.rectId;
    const templateContentId =
      await this.eSignageCMRepository.addTemplateContent(templateContent);
    if (templateContentId === null || templateContentId == undefined) {
      await this.eSignageCMRepository.deleteTemplate(
        new Types.ObjectId(templateId),
      );
      throw new ApolloError(
        `ADD ESignage template content faile`,
        ErrorCode.ESIGNAGNE_ADD_TEMPLATE_CONTENT_FAILE,
      );
    }
    console.log('templateContentId', templateContentId);
    return templateContentId;
  }

  async createTemplateContentLogs(
    templateId: string,
    content: TemplateContent,
    templateLogId: string,
  ): Promise<string> {
    const templateContentLogs = new EsignageTemplateContentLogs();
    templateContentLogs.logId = new Types.ObjectId(templateLogId);
    templateContentLogs.templateId = new Types.ObjectId(templateId);
    templateContentLogs.contentTypeId = new Types.ObjectId(
      content.contentTypeId,
    );
    templateContentLogs.contentName = content.contentName;
    templateContentLogs.tag = content.tag ?? null;
    templateContentLogs.x = content.x ?? null;
    templateContentLogs.y = content.y ?? null;
    templateContentLogs.width = content.width ?? null;
    templateContentLogs.height = content.height ?? null;
    templateContentLogs.rectId = content.rectId;
    const contentLogId = await this.eSignageCMRepository.addTemplateContentLogs(
      templateContentLogs,
    );
    return contentLogId;
  }

  async createWeather(content: TemplateContent): Promise<string> {
    const weather = new EsignageWeather();
    weather.weatherStyleId = new Types.ObjectId(
      content.contentDeatail.weather.weatherStyleId,
    );
    weather.temperatureUnit =
      content.contentDeatail.weather.temperatureUnit ?? 'C';
    weather.windSpeedUnit = content.contentDeatail.weather.windSpeedUnit ?? 'K';
    weather.languageId = new Types.ObjectId(
      content.contentDeatail.weather?.languageId || '628c7b973722a78e25c70f38',
    );
    weather.backgroundColor =
      content.contentDeatail.weather.backgroundColor ?? null;
    weather.durations = content.contentDeatail.weather.durations ?? null;
    weather.citys = content.contentDeatail.weather.citys;
    const weatherId = await this.eSignageCMRepository.addWeather(weather);
    console.log('--Weather Id:', weatherId);
    if (weatherId === null || weatherId == undefined) {
      throw new ApolloError(
        `ADD ESignage weather faile`,
        ErrorCode.ESIGNAGNE_ADD_WEATHER_FAILE,
      );
    }
    return weatherId;
  }

  async createIpCam(cam: IpCam): Promise<string> {
    const ipCam = new EsignageIpcam();
    ipCam.camName = cam.camName;
    ipCam.rtspUrl = cam.rtspUrl;
    ipCam.durations = cam.durations ?? null;
    const ipCamId = await this.eSignageCMRepository.addIpCam(ipCam);
    if (ipCamId === null || ipCamId == undefined) {
      throw new ApolloError(
        `ADD ESignage ipCam faile`,
        ErrorCode.ESIGNAGNE_ADD_IPCAM_FAILE,
      );
    }
    return ipCamId;
  }

  async createWebPage(web: Webpage): Promise<string> {
    const webpage = new EsignageWebpage();
    webpage.webUrl = web.webUrl;
    webpage.playTime = web.playTime ?? null;
    const webPageId = await this.eSignageCMRepository.addWebPage(webpage);
    if (webPageId === null || webPageId == undefined) {
      throw new ApolloError(
        `ADD ESignage webPage faile`,
        ErrorCode.ESIGNAGNE_ADD_WEBPAGE_FAILE,
      );
    }
    return webPageId;
  }

  async createMedia(m: Media, userId: Id, templateId: string): Promise<string> {
    const media = new EsignageMediaPool();
    media.mediaId = new Types.ObjectId(m.mediaId);
    media.userId = new Types.ObjectId(userId);
    media.templateId = new Types.ObjectId(templateId);
    media.imagePlayDurations = m.imagePlayDurations ?? null;
    const mediaId = await this.eSignageCMRepository.addMediaPool(media);
    if (mediaId === null || mediaId == undefined) {
      throw new ApolloError(
        `ADD ESignage media faile`,
        ErrorCode.ESIGNAGNE_ADD_MEDIA_FAILE,
      );
    }
    return mediaId;
  }

  async addSchedule(
    templateScheduleInput: TemplateScheduleInput,
  ): Promise<string> {
    const resScheduleId = await this.createSchedule(templateScheduleInput);
    const templatelogId = await this.eSignageCMRepository.getTemplateLog(
      new Types.ObjectId(templateScheduleInput.templateId),
    );
    if (resScheduleId) {
      await this.createSchedulePublishPlayersLogs(
        templateScheduleInput,
        templatelogId,
      );
      await this.createScheduleLogs(
        templateScheduleInput,
        resScheduleId,
        templatelogId,
      );
    }
    return resScheduleId;
  }

  async createSchedule(
    templateScheduleInput: TemplateScheduleInput,
  ): Promise<string> {
    const schedule = new EsignageSchedule();
    schedule.templateId = new Types.ObjectId(templateScheduleInput.templateId);
    schedule.scheduleName = templateScheduleInput.scheduleName;
    schedule.playStartDate = DateTime.fromISO(
      templateScheduleInput.playStartDate,
    ).toJSDate();

    if (templateScheduleInput.playEndDate) {
      schedule.playEndDate = DateTime.fromISO(
        templateScheduleInput.playEndDate,
      ).toJSDate();
    }
    schedule.playStartTime = templateScheduleInput.playStartTime ?? '00:00:00';
    schedule.playEndTime = templateScheduleInput.playEndTime ?? '23:59:59';
    schedule.loopMode = templateScheduleInput.loopMode ?? 'D';
    schedule.dailyFrequency = templateScheduleInput.dailyFrequency ?? 0;
    schedule.weeklyFrequency = templateScheduleInput.weeklyFrequency ?? [];
    schedule.monthlyFrequency_Month =
      templateScheduleInput.monthlyFrequency_Month ?? [];
    schedule.monthlyFrequency_Day =
      templateScheduleInput.monthlyFrequency_Day ?? [];
    schedule.audioSetting = templateScheduleInput.audioSetting ?? 100;
    schedule.downloadDirectly = templateScheduleInput.downloadDirectly ?? true;
    //2022-04-06T22:15:00.000Z UTC time
    if (templateScheduleInput.scheduledDownloadTime) {
      schedule.scheduledDownloadTime = DateTime.fromISO(
        templateScheduleInput.scheduledDownloadTime,
      ).toJSDate();
    }
    const scheduleId = await this.eSignageCMRepository.addSchedule(schedule);
    if (scheduleId === null || scheduleId == undefined) {
      throw new ApolloError(
        `ADD ESignage Schedule faile`,
        ErrorCode.ESIGNAGNE_ADD_SCHEDULE_FAILE,
      );
    }
    console.log('schedule ID:', scheduleId);
    return scheduleId;
  }

  async createScheduleLogs(
    templateScheduleInput: TemplateScheduleInput,
    scheduleId: string,
    templateLogId: string,
  ): Promise<string> {
    const scheduleLog = new EsignageScheduleLogs();
    scheduleLog.logId = new Types.ObjectId(templateLogId);
    scheduleLog.scheduleId = new Types.ObjectId(scheduleId);
    scheduleLog.templateId = new Types.ObjectId(
      templateScheduleInput.templateId,
    );
    scheduleLog.scheduleName = templateScheduleInput.scheduleName;
    scheduleLog.playStartDate = DateTime.fromISO(
      templateScheduleInput.playStartDate,
    ).toJSDate();

    if (templateScheduleInput.playEndDate) {
      scheduleLog.playEndDate = DateTime.fromISO(
        templateScheduleInput.playEndDate,
      ).toJSDate();
    }
    scheduleLog.playStartTime =
      templateScheduleInput.playStartTime ?? '00:00:00';
    scheduleLog.playEndTime = templateScheduleInput.playEndTime ?? '23:59:59';
    scheduleLog.loopMode = templateScheduleInput.loopMode ?? 'D';
    scheduleLog.dailyFrequency = templateScheduleInput.dailyFrequency ?? 0;
    scheduleLog.weeklyFrequency = templateScheduleInput.weeklyFrequency ?? [];
    scheduleLog.monthlyFrequency_Month =
      templateScheduleInput.monthlyFrequency_Month ?? [];
    scheduleLog.monthlyFrequency_Day =
      templateScheduleInput.monthlyFrequency_Day ?? [];
    scheduleLog.audioSetting = templateScheduleInput.audioSetting ?? 100;
    scheduleLog.downloadDirectly =
      templateScheduleInput.downloadDirectly ?? true;
    if (templateScheduleInput.scheduledDownloadTime) {
      scheduleLog.scheduledDownloadTime = DateTime.fromISO(
        templateScheduleInput.scheduledDownloadTime,
      ).toJSDate();
    }
    // scheduleLog.scheduledDownloadTime =
    //   templateScheduleInput.scheduledDownloadTime ?? null;
    const scheduleLogsId = await this.eSignageCMRepository.addScheduleLogs(
      scheduleLog,
    );
    if (scheduleLogsId === null || scheduleLogsId == undefined) {
      throw new ApolloError(
        `ADD ESignage Schedule faile`,
        ErrorCode.ESIGNAGNE_ADD_SCHEDULE_LOGS_FAILE,
      );
    }
    console.log('scheduleLogs ID:', scheduleLogsId);
    return scheduleLogsId;
  }

  async createSchedulePublishPlayersLogs(
    templateScheduleInput: TemplateScheduleInput,
    templateLogId: string,
  ): Promise<boolean> {
    const players = new EsignageSchedulePublishPlayersLogs();
    players.logId = new Types.ObjectId(templateLogId);
    players.players = templateScheduleInput.players;
    const res = await this.eSignageCMRepository.addSchedulePublishPlayersLogs(
      players,
    );
    return res;
  }

  async updateTemplateSchedule(
    templateScheduleInput: TemplateScheduleInput,
    templateScheduleId: string,
  ): Promise<boolean> {
    const isTemplateSchedule =
      await this.eSignageCMRepository.getTemplateScheduleByScheduleId(
        new Types.ObjectId(templateScheduleId),
        1,
        100,
      );
    const updateSchedule = new EsignageSchedule();
    if (isTemplateSchedule) {
      updateSchedule.templateId = new Types.ObjectId(
        templateScheduleInput.templateId,
      );
      updateSchedule.scheduleName = templateScheduleInput.scheduleName;
      updateSchedule.playStartDate = DateTime.fromISO(
        templateScheduleInput.playStartDate,
      ).toJSDate();

      if (templateScheduleInput.playEndDate) {
        updateSchedule.playEndDate = DateTime.fromISO(
          templateScheduleInput.playEndDate,
        ).toJSDate();
      }
      updateSchedule.playStartTime =
        templateScheduleInput.playStartTime ?? '00:00:00';
      updateSchedule.playEndTime =
        templateScheduleInput.playEndTime ?? '23:59:59';
      updateSchedule.loopMode = templateScheduleInput.loopMode ?? 'D';
      updateSchedule.dailyFrequency = templateScheduleInput.dailyFrequency ?? 0;
      updateSchedule.weeklyFrequency =
        templateScheduleInput.weeklyFrequency ?? [];
      updateSchedule.monthlyFrequency_Month =
        templateScheduleInput.monthlyFrequency_Month ?? [];
      updateSchedule.monthlyFrequency_Day =
        templateScheduleInput.monthlyFrequency_Day ?? [];
      updateSchedule.audioSetting = templateScheduleInput.audioSetting ?? 100;
      updateSchedule.downloadDirectly =
        templateScheduleInput.downloadDirectly ?? true;
      //2022-04-06T22:15:00.000Z UTC time
      if (templateScheduleInput.scheduledDownloadTime) {
        updateSchedule.scheduledDownloadTime = DateTime.fromISO(
          templateScheduleInput.scheduledDownloadTime,
        ).toJSDate();
      }
    }
    const updateRes = await this.eSignageCMRepository.updateTemplateSchedule(
      new Types.ObjectId(templateScheduleId),
      updateSchedule,
    );

    const templatelogId = await this.eSignageCMRepository.getTemplateLog(
      new Types.ObjectId(templateScheduleInput.templateId),
    );
    if (updateRes) {
      await this.createSchedulePublishPlayersLogs(
        templateScheduleInput,
        templatelogId,
      );
      await this.createScheduleLogs(
        templateScheduleInput,
        templateScheduleId,
        templatelogId,
      );
    }
    return updateRes;
  }

  async deleteTemplateSchedule(templateScheduleId: string): Promise<boolean> {
    const res = await this.eSignageCMRepository.deleteTemplateSchedule(
      new Types.ObjectId(templateScheduleId),
    );
    return res;
  }

  async publishScheduleWithTemplate(
    publishScheduleInput: PublishScheduleInput,
  ): Promise<PublishScheduleRes> {
    const cmsToken = await this.getCMSToken(
      'issl-user',
      'issl-user33cc4ca',
      'zh-TW',
    );

    const options = {
      headers: {
        Authorization: `Bearer ${cmsToken}`,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
    };

    const CMSresponse = await this.httpService
      .post(
        `https://cms.chtiss.com/CHT_API/schedules/publishScheduleWithTemplateContentUrl`,
        publishScheduleInput,
        options,
      )
      .toPromise()
      .then((res: AxiosResponse<PublishScheduleRes>) => res.data)
      .catch((error: AxiosError<PublishScheduleRes>) => {
        throw new ApolloError(
          `Get PublishSchedule from CMS with error: ${error.response?.data?.message}.`,
          ErrorCode.CMS_API_ERROR,
        );
      });
    return CMSresponse;
  }

  async publishScheduleWithTemplateAndAddSchedule(
    groupId: string,
    token: string,
    templateScheduleInput: TemplateScheduleInput,
  ): Promise<string> {
    const scheduleId = await this.addSchedule(templateScheduleInput);
    const cmsRes = await this.publishedToCMS(
      groupId,
      token,
      templateScheduleInput,
    );
    if (cmsRes.statusCode === 200) {
      return scheduleId;
    }
    return 'publishedToCMS error';
  }

  async publishScheduleWithTemplateAndUpdateSchedule(
    groupId: string,
    token: string,
    scheduleId: string,
    templateScheduleInput: TemplateScheduleInput,
  ): Promise<boolean> {
    const isUpdateSchedule = await this.updateTemplateSchedule(
      templateScheduleInput,
      scheduleId,
    );
    const cmsRes = await this.publishedToCMS(
      groupId,
      token,
      templateScheduleInput,
    );
    if (cmsRes.statusCode === 200) {
      return true;
    }
    return false;
  }

  async publishedToCMS(
    groupId: string,
    token: string,
    templateScheduleInput: TemplateScheduleInput,
  ): Promise<PublishScheduleRes> {
    //TODO:create html Url(templateContentUrl) -----publish!!!
    const templateContent = await this.getTemplateContent(
      templateScheduleInput.templateId,
    );
    const templateURL = await this.setContent(
      groupId,
      token,
      templateScheduleInput.templateId,
      templateContent,
    );
    const [template] = await this.eSignageCMRepository.getTemplateById(
      new Types.ObjectId(templateScheduleInput.templateId),
      1,
      100,
    );
    const [Height, Width] = template.typeResolution.split('x');

    const publishSchedule = new PublishScheduleInput();
    publishSchedule.playerIDList = templateScheduleInput.players ?? [];
    publishSchedule.templateWidth = parseInt(Width) || 1080; //自己去get長寬
    publishSchedule.templateHeight = parseInt(Height) || 1920;
    publishSchedule.refreshSeconds = 60;
    publishSchedule.templateContentUrl = templateURL ?? ''; //TODO:setContent URL
    const scheduleApi = new ScheduleApiModel();
    scheduleApi.scheduleName = templateScheduleInput.scheduleName;
    scheduleApi.scheduleName = templateScheduleInput.scheduleName;
    scheduleApi.startDate = templateScheduleInput.playStartDate; //需再改依照時區調整，目前為UTC
    scheduleApi.startTime = templateScheduleInput.playStartTime;
    scheduleApi.endDate = templateScheduleInput.playEndDate;
    scheduleApi.endTime = templateScheduleInput.playEndTime;
    scheduleApi.isPlayAllDay = false;
    scheduleApi.volume = templateScheduleInput.audioSetting;
    if (templateScheduleInput.loopMode == 'D') {
      scheduleApi.periodicity = 'Daily';
    } else if (templateScheduleInput.loopMode == 'W') {
      scheduleApi.periodicity = 'Weekly';
    } else if (templateScheduleInput.loopMode == 'M') {
      scheduleApi.periodicity = 'Monthly';
    }
    // scheduleApi.periodicity = templateScheduleInput.loopMode;
    scheduleApi.scheduleLoopDailyDays = templateScheduleInput.dailyFrequency;
    scheduleApi.scheduleLoopWeeklyDaysOfTheWeek =
      templateScheduleInput.weeklyFrequency;

    if (templateScheduleInput.monthlyFrequency_Day != null) {
      const arrOfStr = templateScheduleInput.monthlyFrequency_Day.map((num) => {
        return String(num);
      });
      scheduleApi.scheduleLoopMonthlyMonthsOfTheYear = arrOfStr;
    }

    if (templateScheduleInput.monthlyFrequency_Month != null) {
      const numberArray: number[] = [];
      const numberArrayPlus: number[] = [];
      templateScheduleInput.monthlyFrequency_Month.forEach((ele) =>
        numberArray.push(+ele),
      );
      for (const n of numberArray) {
        numberArrayPlus.push(n + 1);
      }
      scheduleApi.scheduleLoopMonthlyDaysOfTheMonth = numberArrayPlus;
    }
    scheduleApi.isScheduleDownloadRightNow =
      templateScheduleInput.downloadDirectly;
    scheduleApi.scheduleDownloadDateTime =
      templateScheduleInput.scheduledDownloadTime;
    publishSchedule.schedule = scheduleApi;
    console.log(publishSchedule);
    const CMSresponse = await this.publishScheduleWithTemplate(publishSchedule);
    return CMSresponse;
  }

  async getImageById(
    groupId: string,
    token: string,
    imageId: string,
  ): Promise<string> {
    const filenameDestination: { filename: string; destination: string } =
      await this.imageMgmtService.getFilenameAndDestinationbyId({
        _id: imageId,
      });
    const filename = filenameDestination.filename;
    const destination = filenameDestination.destination || '';
    const file = fs.readFileSync(`${destination}/${filename}`, {
      encoding: 'base64',
      flag: 'r',
    });

    let srcList = '';
    const [name, type] = filename.split('.');
    if (type === 'mp4') {
      //videoList
      srcList = await this.videoList(file);
    } else {
      srcList = await this.imageList(file); // create : `<img src=${srcContent} />`
    }
    return srcList;
  }

  async imageList(file: string): Promise<string> {
    const srcContent = `data:image/jpeg;base64,${file}`;
    const imgSrc = `<img src=${srcContent} />`;
    return imgSrc;
  }

  async videoList(file: string): Promise<string> {
    const srcContent = `data:video/mp4;base64,${file}`;
    const vedioSrc = `<video src=${srcContent} autoplay style="position: absolute"></video>`;
    return vedioSrc;
  }

  cityWeatherV1(cityNumber: number) {
    const national = `national${cityNumber}`;
    const temperature = `temperature${cityNumber}`;
    const weatherIcon = `weatherIcon${cityNumber}`;
    const weatherStatus = `weatherStatus${cityNumber}`;

    const weatherLayout = `<div class="weatherA__container">
                        <div class="city">
                          <span id=${national}><span>
                        </div>
                        <div class="weather">
                          <div id=${temperature} class="weather__status">
                          </div>
                          <div class="weather__img">
                            <div>
                              <img id=${weatherIcon} style="width: auto; height: auto;" />
                            </div>
                            <div id=${weatherStatus}></div>
                          </div>
                        </div>
                      </div>`;
    return weatherLayout;
  }

  cityWeatherV2(cityNumber: number) {
    const national = `national${cityNumber}`;
    const temperatureB = `temperatureB${cityNumber}`;
    const weatherIconB = `weatherIconB${cityNumber}`;
    const weatherStatusB = `weatherStatusB${cityNumber}`;
    const riseTime = `riseTime${cityNumber}`;
    const tempMax = `tempMax${cityNumber}`;
    const setTime = `setTime${cityNumber}`;
    const tempMin = `tempMin${cityNumber}`;
    const wind = `wind${cityNumber}`;
    const weatherLayout = `<div class="weatherB_container">
    <div class="cityB">
      <span id=${national}><span>
    </div>
    <div class="weatherB">
      <div id=${temperatureB} class="weather__statusB">
      </div>
      <div class="weather__imgB">
        <div>
          <img id=${weatherIconB} />
        </div>
        <div id=${weatherStatusB}></div>
      </div>
    </div>
    <div class="infoB">
      <div class="info__tempoB p-16">
        <div>
          <span>Sun rise: </span>
          <span id=${riseTime} class="riseTime"></span>
          <span>Max: </span>
          <span id=${tempMax} class="tempMax"></span>
        </div>
        <div>
          <span>Sun set: </span>
          <span id=${setTime} class="setTime"></span>
          <span>Min: </span>
          <span id=${tempMin} class="tempMin"></span>
      </div>
      </div>
      <div class="info__windB p-16">
      <div>
        <span>Wind: </span>
        <span id=${wind}></span>
      </div>
      </div>
    </div>
  </div>`;
    return weatherLayout;
  }

  cityWeatherV3(cityNumber: number) {
    let infoList = '';
    for (let i = 0; i < 5; i++) {
      const v3Info = this.weatherV3Info(cityNumber, i);
      infoList = infoList.concat(v3Info);
    }
    const national = `national${cityNumber}`;
    const source = `<div class="weather_containerC">
    <div class="cityC" style="height:50px">
      <span id=${national}><span>
    </div>
    <div class="day">{{{infoList}}}</div>
</div>`;
    const template = Handlebars.compile(source);
    const data = {
      infoList,
    };
    const weatherLayout = template(data);
    return weatherLayout;
  }

  weatherV3Info(cityNumber: number, infoNumber: number) {
    const date = `date${cityNumber}${infoNumber}`;
    const weatherIcon = `weatherIcon${cityNumber}${infoNumber}`;
    const tempMax = `tempMax${cityNumber}${infoNumber}`;
    const tempMin = `tempMin${cityNumber}${infoNumber}`;
    const infoSrc = `<div class="day__info">
        <span id=${date}></span>
        <span style="height: 100px; width: 100px; padding-top: 35px;">
          <img class="weatherCIcon" id=${weatherIcon} />
        </span>
        <span id=${tempMax}></span>
        <span id=${tempMin}></span>
      </div>`;
    return infoSrc;
  }

  async tempConvert(temp: number, temperatureUnit: string): Promise<number> {
    let localTemp = 0;
    if (temperatureUnit === 'C') {
      localTemp = temp - 273.15;
    }
    if (temperatureUnit === 'F') {
      localTemp = (temp * 9) / 5 - 459.67;
    }
    return parseFloat(localTemp.toPrecision(12));
  }

  async windConvert(wind: number, windUnit: string): Promise<number> {
    let localWind = 0;
    if (windUnit === 'K') {
      localWind = wind * 3.6;
    }
    if (windUnit === 'F') {
      localWind = wind * 2.236;
    }
    return localWind;
  }

  /**
   * @模板A
   */
  async createPublishTemplateA(
    templateContent: GetTemplateContent,
    templateType: string,
    groupId: string,
    token: string,
  ): Promise<string> {
    let mediaList = '';
    let mediaList2 = '';
    let webList = '';
    let windUnit = '';
    let tempUnit = '';
    let backgroundColor = '';
    const cityList: string[] = [];
    let weatherType = '';
    let weatherLayout = '';
    let weatherList = '';
    // let weather = '';
    const webPageList = '';
    for (const tpContent of templateContent.templateContent) {
      if (tpContent.templateContentDetail.weather) {
        backgroundColor =
          tpContent.templateContentDetail.weather.backgroundColor;
        tempUnit =
          tpContent.templateContentDetail.weather.temperatureUnit ?? 'C'; //C or F
        windUnit = tpContent.templateContentDetail.weather.windSpeedUnit ?? 'K'; //K or F
        switch (tpContent.templateContentDetail.weather.weatherStyleId) {
          case '628dd82d1df620dbe862924d':
            console.log('This is weatherType 1');
            weatherType = '1';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV1(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924e':
            console.log('This is weatherType 2');
            weatherType = '2';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV2(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924f':
            console.log('This is weatherType 3');
            weatherType = '3';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV3(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          default:
            console.log('This is not support your weatherType.');
        }
      }
      if (
        tpContent.templateContentDetail.media &&
        tpContent.templateContentDetail.media.length > 0
      ) {
        if (tpContent.rectId === 'rect2') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList = mediaList.concat(srcImg);
          }
        }
        if (tpContent.rectId === 'rect3') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList2 = mediaList2.concat(srcImg);
          }
        }
      }
      if (
        tpContent.templateContentDetail.webpage &&
        tpContent.templateContentDetail.webpage.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.webpage) {
          const url = w.webUrl;
          const webSrc = `<iframe src=${url} style="position: absolute"></iframe>`;
          webList = webList.concat(webSrc);
        }
      }
    }

    const source = `<html>
      <head>
        <link rel="stylesheet" type="text/css" href="./publish.css">
        <script src="./publish2.js"></script>
      </head>
          <body>
          <div id="cityList" style="display:none">{{cityList}}</div>
          <div id="tempUnit" style="display:none">{{tempUnit}}</div>
          <div id="windUnit" style="display:none">{{windUnit}}</div>
          <div id="weatherType" style="display:none">{{weatherType}}</div>
          <div id="backgroundColor" style="display:none">{{backgroundColor}}</div>
          <div id="templateType" style="display:none">${templateType}</div>
            <div id="container" style="width: 1080px; height: 1920px; margin: 0 auto;">
              <div id="cover" class="coverflow">
                <div style="width: 60%; height: 33.333%; border-right: 10px solid transparent">
                  <div id="weather" style="height: 100%; position: relative;">{{{weatherList}}}</div>
                </div>
                <div id="slider" style="width: 40%; height: 33.333%; position: relative;">{{{mediaList}}}</div>
                <div id="slider2" style="width: 100%; height: 33.333%; position: relative; border-top: 10px solid transparent; border-bottom: 10px solid transparent">{{{mediaList2}}}</div>
                <div id="web" style="width: 100%; height: 33.333%; position: relative;">{{{webList}}}</div>
              </div>
            </div>
          </body>
      </html>`;
    const template2 = Handlebars.compile(source);
    const data = {
      mediaList,
      mediaList2,
      webList,
      cityList,
      tempUnit,
      windUnit,
      weatherType,
      backgroundColor,
      weatherList,
    };
    const result = template2(data);
    const storeIn = await this.storeInHtml(templateContent.id, result);
    return storeIn;
  }

  /**
   * @模板B
   */
  async createPublishTemplateB(
    templateContent: GetTemplateContent,
    templateType: string,
    groupId: string,
    token: string,
  ): Promise<string> {
    let mediaList = '';
    const mediaList2 = '';
    let webList = '';
    let windUnit = '';
    let tempUnit = '';
    let backgroundColor = '';
    const cityList: string[] = [];
    let weatherType = '';
    let weatherLayout = '';
    let weatherList = '';
    // let weather = '';
    const webPageList = '';
    for (const tpContent of templateContent.templateContent) {
      if (tpContent.templateContentDetail.weather) {
        backgroundColor =
          tpContent.templateContentDetail.weather.backgroundColor;
        tempUnit =
          tpContent.templateContentDetail.weather.temperatureUnit ?? 'C'; //C or F
        windUnit = tpContent.templateContentDetail.weather.windSpeedUnit ?? 'K'; //K or F
        switch (tpContent.templateContentDetail.weather.weatherStyleId) {
          case '628dd82d1df620dbe862924d':
            console.log('This is weatherType 1');
            weatherType = '1';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV1(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924e':
            console.log('This is weatherType 2');
            weatherType = '2';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV2(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924f':
            console.log('This is weatherType 3');
            weatherType = '3';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV3(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          default:
            console.log('This is not support your weatherType.');
        }
      }
      if (
        tpContent.templateContentDetail.media &&
        tpContent.templateContentDetail.media.length > 0
      ) {
        if (tpContent.rectId === 'rect2') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList = mediaList.concat(srcImg);
          }
        }
      }
      if (
        tpContent.templateContentDetail.webpage &&
        tpContent.templateContentDetail.webpage.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.webpage) {
          const url = w.webUrl;
          const webSrc = `<iframe src=${url} style="position: absolute"></iframe>`;
          webList = webList.concat(webSrc);
        }
      }
    }

    const source = `<html>
      <head>
        <link rel="stylesheet" type="text/css" href="./publish.css">
        <script defer src="./publish2.js"></script> 
      </head>
          <body>
          <div id="cityList" style="display:none">{{cityList}}</div>
          <div id="tempUnit" style="display:none">{{tempUnit}}</div>
          <div id="windUnit" style="display:none">{{windUnit}}</div>
          <div id="weatherType" style="display:none">{{weatherType}}</div>
          <div id="backgroundColor" style="display:none">{{backgroundColor}}</div>
          <div id="templateType" style="display:none">${templateType}</div>
            <div id="container" style="width: 1080px; height: 1920px; margin: 0 auto;">
              <div id="cover" class="coverflow">
                <div style="width: 100%; height: 33.333%;">
                  <div id="weather" style="height: 100%; position: relative;">{{{weatherList}}}</div>
                </div>
                <div id="slider" style="width: 100%; height: 33.333%; position: relative; border-top: 10px solid transparent; border-bottom: 10px solid transparent">{{{mediaList}}}</div>
                <div id="slider2" style="width: 0%; height: 0%; position: relative;">{{{mediaList2}}}</div>
                <div id="web" style="width: 100%; height: 33.333%; position: relative;">{{{webList}}}</div>
              </div>
            </div>
          </body>
      </html>`;
    const template2 = Handlebars.compile(source);
    const data = {
      mediaList,
      mediaList2,
      webList,
      cityList,
      tempUnit,
      windUnit,
      weatherType,
      backgroundColor,
      weatherList,
    };
    const result = template2(data);
    const storeIn = await this.storeInHtml(templateContent.id, result);
    return storeIn;
  }

  /**
   * @模板C
   */
  async createPublishTemplateC(
    templateContent: GetTemplateContent,
    templateType: string,
    groupId: string,
    token: string,
  ): Promise<string> {
    let mediaList = '';
    const mediaList2 = '';
    let webList = '';
    let windUnit = '';
    let tempUnit = '';
    let backgroundColor = '';
    const cityList: string[] = [];
    let weatherType = '';
    let weatherLayout = '';
    let weatherList = '';
    // let weather = '';
    const webPageList = '';
    for (const tpContent of templateContent.templateContent) {
      if (tpContent.templateContentDetail.weather) {
        backgroundColor =
          tpContent.templateContentDetail.weather.backgroundColor;
        tempUnit =
          tpContent.templateContentDetail.weather.temperatureUnit ?? 'C'; //C or F
        windUnit = tpContent.templateContentDetail.weather.windSpeedUnit ?? 'K'; //K or F
        switch (tpContent.templateContentDetail.weather.weatherStyleId) {
          case '628dd82d1df620dbe862924d':
            console.log('This is weatherType 1');
            weatherType = '1';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV1(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924e':
            console.log('This is weatherType 2');
            weatherType = '2';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV2(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924f':
            console.log('This is weatherType 3');
            weatherType = '3';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV3(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          default:
            console.log('This is not support your weatherType.');
        }
      }
      if (
        tpContent.templateContentDetail.media &&
        tpContent.templateContentDetail.media.length > 0
      ) {
        if (tpContent.rectId === 'rect2') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList = mediaList.concat(srcImg);
          }
        }
      }
      if (
        tpContent.templateContentDetail.webpage &&
        tpContent.templateContentDetail.webpage.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.webpage) {
          const url = w.webUrl;
          const webSrc = `<iframe src=${url} style="position: absolute"></iframe>`;
          webList = webList.concat(webSrc);
        }
      }
    }

    const source = `<html>
      <head>
        <link rel="stylesheet" type="text/css" href="./publish.css">
        <script defer src="./publish2.js"></script> 
      </head>
          <body>
          <div id="cityList" style="display:none">{{cityList}}</div>
          <div id="tempUnit" style="display:none">{{tempUnit}}</div>
          <div id="windUnit" style="display:none">{{windUnit}}</div>
          <div id="weatherType" style="display:none">{{weatherType}}</div>
          <div id="backgroundColor" style="display:none">{{backgroundColor}}</div>
          <div id="templateType" style="display:none">${templateType}</div>
            <div id="container" style="width: 1080px; height: 1920px; margin: 0 auto;">
              <div id="cover" class="coverflow">
                <div style="width: 60%; height: 33.333%; border-right: 10px solid transparent">
                  <div id="weather" style="height: 100%; position: relative;">{{{weatherList}}}</div>
                </div>
                <div id="slider" style="width: 40%; height: 33.333%; position: relative;">{{{mediaList}}}</div>
                <div id="slider2" style="width: 0%; height: 0%; position: relative;">{{{mediaList2}}}</div>
                <div id="web" style="width: 100%; height: 66%; position: relative; border-top: 10px solid transparent">{{{webList}}}</div>
              </div>
            </div>
          </body>
      </html>`;
    const template2 = Handlebars.compile(source);
    const data = {
      mediaList,
      mediaList2,
      webList,
      cityList,
      tempUnit,
      windUnit,
      weatherType,
      backgroundColor,
      weatherList,
    };
    const result = template2(data);
    const storeIn = await this.storeInHtml(templateContent.id, result);
    return storeIn;
  }

  /**
   * @模板D
   */
  async createPublishTemplateD(
    templateContent: GetTemplateContent,
    templateType: string,
    groupId: string,
    token: string,
  ): Promise<string> {
    let mediaList = '';
    let mediaList2 = '';
    let webList = '';
    let camList = '';
    let windUnit = '';
    let tempUnit = '';
    let backgroundColor = '';
    const cityList: string[] = [];
    let weatherType = '';
    let weatherLayout = '';
    let weatherList = '';
    // let weather = '';
    const webPageList = '';
    for (const tpContent of templateContent.templateContent) {
      if (tpContent.templateContentDetail.weather) {
        backgroundColor =
          tpContent.templateContentDetail.weather.backgroundColor;
        tempUnit =
          tpContent.templateContentDetail.weather.temperatureUnit ?? 'C'; //C or F
        windUnit = tpContent.templateContentDetail.weather.windSpeedUnit ?? 'K'; //K or F
        switch (tpContent.templateContentDetail.weather.weatherStyleId) {
          case '628dd82d1df620dbe862924d':
            console.log('This is weatherType 1');
            weatherType = '1';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV1(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924e':
            console.log('This is weatherType 2');
            weatherType = '2';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV2(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924f':
            console.log('This is weatherType 3');
            weatherType = '3';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV3(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          default:
            console.log('This is not support your weatherType.');
        }
      }
      if (
        tpContent.templateContentDetail.media &&
        tpContent.templateContentDetail.media.length > 0
      ) {
        if (tpContent.rectId === 'rect2') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList = mediaList.concat(srcImg);
          }
        }
        if (tpContent.rectId === 'rect3') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList2 = mediaList2.concat(srcImg);
          }
        }
      }
      if (
        tpContent.templateContentDetail.webpage &&
        tpContent.templateContentDetail.webpage.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.webpage) {
          const url = w.webUrl;
          const webSrc = `<iframe src=${url} style="position: absolute"></iframe>`;
          webList = webList.concat(webSrc);
        }
      }
      if (
        tpContent.templateContentDetail.cam &&
        tpContent.templateContentDetail.cam.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.cam) {
          const url = w.rtspUrl;
          const camSrc = `<video id="ip_cam" data-url=${url}></video>`;
          camList = camList.concat(camSrc);
        }
      }
    }

    const source = `<html>
      <head>
        <link rel="stylesheet" type="text/css" href="./publish.css">
        <script defer src="./publish2.js"></script>
        <script defer src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script> 
      </head>
          <body>
          <div id="cityList" style="display:none">{{cityList}}</div>
          <div id="tempUnit" style="display:none">{{tempUnit}}</div>
          <div id="windUnit" style="display:none">{{windUnit}}</div>
          <div id="weatherType" style="display:none">{{weatherType}}</div>
          <div id="backgroundColor" style="display:none">{{backgroundColor}}</div>
          <div id="templateType" style="display:none">${templateType}</div>
            <div id="container" style="width: 1080px; height: 1920px; margin: 0 auto;">
              <div id="cover" class="coverflow">
                <div style="width: 60%; height: 33.333%; border-right: 10px solid transparent">
                  <div id="weather" style="height: 100%; position: relative;">{{{weatherList}}}</div>
                </div>
                <div id="slider" style="width: 40%; height: 33.333%; position: relative;">{{{mediaList}}}</div>
                <div id="slider2" style="width: 100%; height: 33.333%; position: relative; border-top: 10px solid transparent; border-bottom: 10px solid transparent">{{{mediaList2}}}</div>
                <div id="web" style="width: 50%; height: 33.333%; position: relative;border-right: 10px solid transparent">{{{webList}}}</div>
                <div class="section3" style="width: 50%; height: 33.333%;">{{{camList}}}</div>
              </div>
            </div>
          </body>
      </html>`;
    const template2 = Handlebars.compile(source);
    const data = {
      mediaList,
      mediaList2,
      webList,
      camList,
      cityList,
      tempUnit,
      windUnit,
      weatherType,
      backgroundColor,
      weatherList,
    };
    const result = template2(data);
    const storeIn = await this.storeInHtml(templateContent.id, result);
    return storeIn;
  }

  /**
   * @模板E
   */
  async createPublishTemplateE(
    templateContent: GetTemplateContent,
    templateType: string,
    groupId: string,
    token: string,
  ): Promise<string> {
    let mediaList = '';
    let mediaList2 = '';
    let webList = '';
    let camList = '';
    let windUnit = '';
    let tempUnit = '';
    let backgroundColor = '';
    const cityList: string[] = [];
    let weatherType = '';
    let weatherLayout = '';
    let weatherList = '';
    // let weather = '';
    const webPageList = '';
    for (const tpContent of templateContent.templateContent) {
      if (tpContent.templateContentDetail.weather) {
        backgroundColor =
          tpContent.templateContentDetail.weather.backgroundColor;
        tempUnit =
          tpContent.templateContentDetail.weather.temperatureUnit ?? 'C'; //C or F
        windUnit = tpContent.templateContentDetail.weather.windSpeedUnit ?? 'K'; //K or F
        switch (tpContent.templateContentDetail.weather.weatherStyleId) {
          case '628dd82d1df620dbe862924d':
            console.log('This is weatherType 1');
            weatherType = '1';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV1(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924e':
            console.log('This is weatherType 2');
            weatherType = '2';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV2(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924f':
            console.log('This is weatherType 3');
            weatherType = '3';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV3(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          default:
            console.log('This is not support your weatherType.');
        }
      }
      if (
        tpContent.templateContentDetail.media &&
        tpContent.templateContentDetail.media.length > 0
      ) {
        if (tpContent.rectId === 'rect2') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList = mediaList.concat(srcImg);
          }
        }
        if (tpContent.rectId === 'rect3') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList2 = mediaList2.concat(srcImg);
          }
        }
      }
      if (
        tpContent.templateContentDetail.webpage &&
        tpContent.templateContentDetail.webpage.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.webpage) {
          const url = w.webUrl;
          const webSrc = `<iframe src=${url} style="position: absolute"></iframe>`;
          webList = webList.concat(webSrc);
        }
      }
      if (
        tpContent.templateContentDetail.cam &&
        tpContent.templateContentDetail.cam.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.cam) {
          const url = w.rtspUrl;
          const camSrc = `<video id="ip_cam" data-url=${url}></video>`;
          camList = camList.concat(camSrc);
        }
      }
    }

    const source = `<html>
      <head>
        <link rel="stylesheet" type="text/css" href="./publish.css">
        <script defer src="./publish2.js"></script>
        <script defer src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script> 
      </head>
          <body>
          <div id="cityList" style="display:none">{{cityList}}</div>
          <div id="tempUnit" style="display:none">{{tempUnit}}</div>
          <div id="windUnit" style="display:none">{{windUnit}}</div>
          <div id="weatherType" style="display:none">{{weatherType}}</div>
          <div id="backgroundColor" style="display:none">{{backgroundColor}}</div>
          <div id="templateType" style="display:none">${templateType}</div>
            <div id="container" style="width: 1080px; height: 1920px; margin: 0 auto;">
              <div id="cover" class="coverflow">
                <div style="width: 100%; height: 33.333%;">
                  <div id="weather" style="height: 100%; position: relative;">{{{weatherList}}}</div>
                </div>
                <div id="slider" style="width: 100%; height: 33.333%; position: relative; border-top: 10px solid transparent; border-bottom: 10px solid transparent">{{{mediaList}}}</div>
                <div id="slider2" style="width: 0%; height: 0%; position: relative;">{{{mediaList2}}}</div>
                <div id="web" style="width: 49%; height: 33.333%; position: relative; border-right: 10px solid transparent">{{{webList}}}</div>
                <div class="section3" style="width: 50%; height: 33.333%;">{{{camList}}}</div>
              </div>
            </div>
          </body>
      </html>`;
    const template2 = Handlebars.compile(source);
    const data = {
      mediaList,
      mediaList2,
      webList,
      camList,
      cityList,
      tempUnit,
      windUnit,
      weatherType,
      backgroundColor,
      weatherList,
    };
    const result = template2(data);
    const storeIn = await this.storeInHtml(templateContent.id, result);
    return storeIn;
  }

  /**
   * @模板F
   */
  async createPublishTemplateF(
    templateContent: GetTemplateContent,
    templateType: string,
    groupId: string,
    token: string,
  ): Promise<string> {
    let mediaList = '';
    let mediaList2 = '';
    let webList = '';
    let camList = '';
    let camList2 = '';
    let windUnit = '';
    let tempUnit = '';
    let backgroundColor = '';
    const cityList: string[] = [];
    let weatherType = '';
    let weatherLayout = '';
    let weatherList = '';
    // let weather = '';
    const webPageList = '';
    for (const tpContent of templateContent.templateContent) {
      if (tpContent.templateContentDetail.weather) {
        backgroundColor =
          tpContent.templateContentDetail.weather.backgroundColor;
        tempUnit =
          tpContent.templateContentDetail.weather.temperatureUnit ?? 'C'; //C or F
        windUnit = tpContent.templateContentDetail.weather.windSpeedUnit ?? 'K'; //K or F
        switch (tpContent.templateContentDetail.weather.weatherStyleId) {
          case '628dd82d1df620dbe862924d':
            console.log('This is weatherType 1');
            weatherType = '1';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV1(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924e':
            console.log('This is weatherType 2');
            weatherType = '2';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV2(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924f':
            console.log('This is weatherType 3');
            weatherType = '3';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV3(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          default:
            console.log('This is not support your weatherType.');
        }
      }
      if (
        tpContent.templateContentDetail.media &&
        tpContent.templateContentDetail.media.length > 0
      ) {
        if (tpContent.rectId === 'rect2') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList = mediaList.concat(srcImg);
          }
        }
        if (tpContent.rectId === 'rect3') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList2 = mediaList2.concat(srcImg);
          }
        }
      }
      if (
        tpContent.templateContentDetail.webpage &&
        tpContent.templateContentDetail.webpage.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.webpage) {
          const url = w.webUrl;
          const webSrc = `<iframe src=${url} style="position: absolute"></iframe>`;
          webList = webList.concat(webSrc);
        }
      }
      if (
        tpContent.templateContentDetail.cam &&
        tpContent.templateContentDetail.cam.length > 0
      ) {
        if (tpContent.rectId === 'rect4') {
          for (const w of tpContent.templateContentDetail.cam) {
            const url = w.rtspUrl;
            const camSrc = `<video id="ip_cam" data-url=${url}></video>`;
            camList = camList.concat(camSrc);
          }
        }
        if (tpContent.rectId === 'rect5') {
          for (const w of tpContent.templateContentDetail.cam) {
            const url = w.rtspUrl;
            const camSrc = `<video id="ip_cam2" data-url=${url}></video>`;
            camList2 = camList2.concat(camSrc);
          }
        }
      }
    }

    const source = `<html>
      <head>
        <link rel="stylesheet" type="text/css" href="./publish.css">
        <script defer src="./publish2.js"></script>
        <script defer src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script> 
      </head>
          <body>
          <div id="cityList" style="display:none">{{cityList}}</div>
          <div id="tempUnit" style="display:none">{{tempUnit}}</div>
          <div id="windUnit" style="display:none">{{windUnit}}</div>
          <div id="weatherType" style="display:none">{{weatherType}}</div>
          <div id="backgroundColor" style="display:none">{{backgroundColor}}</div>
          <div id="templateType" style="display:none">${templateType}</div>
            <div id="container" style="width: 1080px; height: 1920px; margin: 0 auto;">
              <div id="cover" class="coverflow">
                <div style="width: 60%; height: 33.333%; border-right: 10px solid transparent">
                  <div id="weather" style="height: 100%; position: relative;">{{{weatherList}}}</div>
                </div>
                <div id="slider" style="width: 40%; height: 33.333%; position: relative; ">{{{mediaList}}}</div>
                <div id="slider2" style="width: 0%; height: 0%; position: relative; border-top: 10px solid transparent; border-bottom: 10px solid transparent">{{{mediaList2}}}</div>
                <div id="web" style="width: 100%; height: 33.333%; position: relative; border-top: 10px solid transparent; border-bottom: 10px solid transparent">{{{webList}}}</div>
                <div class="section3" style="width: 49%; height: 33.333%; border-right: 10px solid transparent ">{{{camList}}}</div>
                <div class="section3" style="width: 49%; height: 33.333%;">{{{camList2}}}</div>
              </div>
            </div>
          </body>
      </html>`;
    const template2 = Handlebars.compile(source);
    const data = {
      mediaList,
      mediaList2,
      webList,
      camList,
      camList2,
      cityList,
      tempUnit,
      windUnit,
      weatherType,
      backgroundColor,
      weatherList,
    };
    const result = template2(data);
    const storeIn = await this.storeInHtml(templateContent.id, result);
    return storeIn;
  }

  /**
   * @模板G
   */
  async createPublishTemplateG(
    templateContent: GetTemplateContent,
    templateType: string,
    groupId: string,
    token: string,
  ): Promise<string> {
    let webList = '';
    let windUnit = '';
    let tempUnit = '';
    let backgroundColor = '';
    const cityList: string[] = [];
    let weatherType = '';
    let weatherLayout = '';
    let weatherList = '';
    // let weather = '';
    const webPageList = '';
    for (const tpContent of templateContent.templateContent) {
      if (tpContent.templateContentDetail.weather) {
        backgroundColor =
          tpContent.templateContentDetail.weather.backgroundColor;
        tempUnit =
          tpContent.templateContentDetail.weather.temperatureUnit ?? 'C'; //C or F
        windUnit = tpContent.templateContentDetail.weather.windSpeedUnit ?? 'K'; //K or F
        switch (tpContent.templateContentDetail.weather.weatherStyleId) {
          case '628dd82d1df620dbe862924d':
            console.log('This is weatherType 1');
            weatherType = '1';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV1(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924e':
            console.log('This is weatherType 2');
            weatherType = '2';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV2(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924f':
            console.log('This is weatherType 3');
            weatherType = '3';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV3(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          default:
            console.log('This is not support your weatherType.');
        }
      }
      if (
        tpContent.templateContentDetail.webpage &&
        tpContent.templateContentDetail.webpage.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.webpage) {
          const url = w.webUrl;
          const webSrc = `<iframe src=${url} style="position: absolute"></iframe>`;
          webList = webList.concat(webSrc);
        }
      }
    }

    const source = `<html>
      <head>
        <link rel="stylesheet" type="text/css" href="./publish.css">
        <script defer src="./publish2.js"></script> 
      </head>
          <body>
          <div id="cityList" style="display:none">{{cityList}}</div>
          <div id="tempUnit" style="display:none">{{tempUnit}}</div>
          <div id="windUnit" style="display:none">{{windUnit}}</div>
          <div id="weatherType" style="display:none">{{weatherType}}</div>
          <div id="backgroundColor" style="display:none">{{backgroundColor}}</div>
          <div id="templateType" style="display:none">${templateType}</div>
            <div id="container" style="width: 1920px; height: 1080px; margin: 0 auto;">
              <div id="cover" class="coverflow">
              <div id="web" style="width: 100%; height: 50%; position: relative; border-bottom: 10px solid transparent;">{{{webList}}}</div>
              <div style="width: 100%; height: 50%;">
                  <div id="weather" style="height: 100%; position: relative;">{{{weatherList}}}</div>
                </div>
              </div>
            </div>
          </body>
      </html>`;
    const template2 = Handlebars.compile(source);
    const data = {
      webList,
      cityList,
      tempUnit,
      windUnit,
      weatherType,
      backgroundColor,
      weatherList,
    };
    const result = template2(data);
    const storeIn = await this.storeInHtml(templateContent.id, result);
    return storeIn;
  }

  /**
   * @模板H
   */
  async createPublishTemplateH(
    templateContent: GetTemplateContent,
    templateType: string,
    groupId: string,
    token: string,
  ): Promise<string> {
    let webList = '';
    let windUnit = '';
    let tempUnit = '';
    let backgroundColor = '';
    const cityList: string[] = [];
    let weatherType = '';
    let weatherLayout = '';
    let weatherList = '';
    // let weather = '';
    const webPageList = '';
    for (const tpContent of templateContent.templateContent) {
      if (tpContent.templateContentDetail.weather) {
        backgroundColor =
          tpContent.templateContentDetail.weather.backgroundColor;
        tempUnit =
          tpContent.templateContentDetail.weather.temperatureUnit ?? 'C'; //C or F
        windUnit = tpContent.templateContentDetail.weather.windSpeedUnit ?? 'K'; //K or F
        switch (tpContent.templateContentDetail.weather.weatherStyleId) {
          case '628dd82d1df620dbe862924d':
            console.log('This is weatherType 1');
            weatherType = '1';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV1(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924e':
            console.log('This is weatherType 2');
            weatherType = '2';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV2(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924f':
            console.log('This is weatherType 3');
            weatherType = '3';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV3(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          default:
            console.log('This is not support your weatherType.');
        }
      }
      if (
        tpContent.templateContentDetail.webpage &&
        tpContent.templateContentDetail.webpage.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.webpage) {
          const url = w.webUrl;
          const webSrc = `<iframe src=${url} style="position: absolute"></iframe>`;
          webList = webList.concat(webSrc);
        }
      }
    }

    const source = `<html>
      <head>
        <link rel="stylesheet" type="text/css" href="./publish.css">
        <script defer src="./publish2.js"></script> 
      </head>
          <body>
          <div id="cityList" style="display:none">{{cityList}}</div>
          <div id="tempUnit" style="display:none">{{tempUnit}}</div>
          <div id="windUnit" style="display:none">{{windUnit}}</div>
          <div id="weatherType" style="display:none">{{weatherType}}</div>
          <div id="backgroundColor" style="display:none">{{backgroundColor}}</div>
          <div id="templateType" style="display:none">${templateType}</div>
            <div id="container" style="width: 1920px; height: 1080px; margin: 0 auto;">
              <div id="cover" class="coverflow">
                <div style="width: 100%; height: 50%; border-right: 10px solid transparent">
                  <div id="weather" style="height: 100%; position: relative;">{{{weatherList}}}</div>
                </div>
                <div id="web" style="width: 100%; height: 50%; position: relative; border-top: 10px solid transparent;">{{{webList}}}</div>
              </div>
            </div>
          </body>
      </html>`;
    const template2 = Handlebars.compile(source);
    const data = {
      webList,
      cityList,
      tempUnit,
      windUnit,
      weatherType,
      backgroundColor,
      weatherList,
    };
    const result = template2(data);
    const storeIn = await this.storeInHtml(templateContent.id, result);
    return storeIn;
  }

  /**
   * @模板I
   */
  async createPublishTemplateI(
    templateContent: GetTemplateContent,
    templateType: string,
    groupId: string,
    token: string,
  ): Promise<string> {
    let mediaList = '';
    let webList = '';
    let windUnit = '';
    let tempUnit = '';
    let backgroundColor = '';
    const cityList: string[] = [];
    let weatherType = '';
    let weatherLayout = '';
    let weatherList = '';
    // let weather = '';
    const webPageList = '';
    for (const tpContent of templateContent.templateContent) {
      if (tpContent.templateContentDetail.weather) {
        backgroundColor =
          tpContent.templateContentDetail.weather.backgroundColor;
        tempUnit =
          tpContent.templateContentDetail.weather.temperatureUnit ?? 'C'; //C or F
        windUnit = tpContent.templateContentDetail.weather.windSpeedUnit ?? 'K'; //K or F
        switch (tpContent.templateContentDetail.weather.weatherStyleId) {
          case '628dd82d1df620dbe862924d':
            console.log('This is weatherType 1');
            weatherType = '1';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV1(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924e':
            console.log('This is weatherType 2');
            weatherType = '2';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV2(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924f':
            console.log('This is weatherType 3');
            weatherType = '3';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV3(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          default:
            console.log('This is not support your weatherType.');
        }
      }
      if (
        tpContent.templateContentDetail.media &&
        tpContent.templateContentDetail.media.length > 0
      ) {
        if (tpContent.rectId === 'rect2') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList = mediaList.concat(srcImg);
          }
        }
      }
      if (
        tpContent.templateContentDetail.webpage &&
        tpContent.templateContentDetail.webpage.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.webpage) {
          const url = w.webUrl;
          const webSrc = `<iframe src=${url} style="position: absolute"></iframe>`;
          webList = webList.concat(webSrc);
        }
      }
    }

    const source = `<html>
      <head>
        <link rel="stylesheet" type="text/css" href="./publish.css">
        <script defer src="./publish2.js"></script> 
      </head>
          <body>
          <div id="cityList" style="display:none">{{cityList}}</div>
          <div id="tempUnit" style="display:none">{{tempUnit}}</div>
          <div id="windUnit" style="display:none">{{windUnit}}</div>
          <div id="weatherType" style="display:none">{{weatherType}}</div>
          <div id="backgroundColor" style="display:none">{{backgroundColor}}</div>
          <div id="templateType" style="display:none">${templateType}</div>
            <div id="container" style="width: 1920px; height: 1080px; margin: 0 auto;">
              <div id="cover" class="coverflow">
                <div style="width: 0%; height: 0%; border-right: 10px solid transparent">
                  <div id="weather" style="height: 100%; position: relative;">{{{weatherList}}}</div>
                </div>
                <div id="slider" style="width: 49%; height: 100%; position: relative;">{{{mediaList}}}</div>
                <div id="web" style="width: 50%; height: 100%; position: relative; border-left: 10px solid transparent;">{{{webList}}}</div>
              </div>
            </div>
          </body>
      </html>`;
    const template2 = Handlebars.compile(source);
    const data = {
      mediaList,
      webList,
      cityList,
      tempUnit,
      windUnit,
      weatherType,
      backgroundColor,
      weatherList,
    };
    const result = template2(data);
    const storeIn = await this.storeInHtml(templateContent.id, result);
    return storeIn;
  }

  /**
   * @模板J
   */
  async createPublishTemplateJ(
    templateContent: GetTemplateContent,
    templateType: string,
    groupId: string,
    token: string,
  ): Promise<string> {
    let mediaList = '';
    let mediaList2 = '';
    let webList = '';
    let camList = '';
    let windUnit = '';
    let tempUnit = '';
    let backgroundColor = '';
    const cityList: string[] = [];
    let weatherType = '';
    let weatherLayout = '';
    let weatherList = '';
    // let weather = '';
    const webPageList = '';
    for (const tpContent of templateContent.templateContent) {
      if (tpContent.templateContentDetail.weather) {
        backgroundColor =
          tpContent.templateContentDetail.weather.backgroundColor;
        tempUnit =
          tpContent.templateContentDetail.weather.temperatureUnit ?? 'C'; //C or F
        windUnit = tpContent.templateContentDetail.weather.windSpeedUnit ?? 'K'; //K or F
        switch (tpContent.templateContentDetail.weather.weatherStyleId) {
          case '628dd82d1df620dbe862924d':
            console.log('This is weatherType 1');
            weatherType = '1';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV1(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924e':
            console.log('This is weatherType 2');
            weatherType = '2';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV2(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924f':
            console.log('This is weatherType 3');
            weatherType = '3';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV3(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          default:
            console.log('This is not support your weatherType.');
        }
      }
      if (
        tpContent.templateContentDetail.media &&
        tpContent.templateContentDetail.media.length > 0
      ) {
        if (tpContent.rectId === 'rect2') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList = mediaList.concat(srcImg);
          }
        }
        if (tpContent.rectId === 'rect3') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList2 = mediaList2.concat(srcImg);
          }
        }
      }
      if (
        tpContent.templateContentDetail.webpage &&
        tpContent.templateContentDetail.webpage.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.webpage) {
          const url = w.webUrl;
          const webSrc = `<iframe src=${url} style="position: absolute"></iframe>`;
          webList = webList.concat(webSrc);
        }
      }
      if (
        tpContent.templateContentDetail.cam &&
        tpContent.templateContentDetail.cam.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.cam) {
          const url = w.rtspUrl;
          const camSrc = `<video id="ip_cam" data-url=${url}></video>`;
          camList = camList.concat(camSrc);
        }
      }
    }

    const source = `<html>
      <head>
        <link rel="stylesheet" type="text/css" href="./publish.css">
        <script defer src="./publish2.js"></script>
        <script defer src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script> 
      </head>
          <body>
          <div id="cityList" style="display:none">{{cityList}}</div>
          <div id="tempUnit" style="display:none">{{tempUnit}}</div>
          <div id="windUnit" style="display:none">{{windUnit}}</div>
          <div id="weatherType" style="display:none">{{weatherType}}</div>
          <div id="backgroundColor" style="display:none">{{backgroundColor}}</div>
          <div id="templateType" style="display:none">${templateType}</div>
            <div id="container" style="width: 1920px; height: 1080px; margin: 0 auto;">
              <div id="cover" class="coverflow">
                <div id="web" style="width: 100%; height: 50%; position: relative; border-bottom: 10px solid transparent">{{{webList}}}</div>
                <div style="width: 50%; height: 50%; border-right: 10px solid transparent">
                  <div id="weather" style="height: 100%; position: relative;">{{{weatherList}}}</div>
                </div>
                <div class="section3" style="width: 50%; height: 50%;">{{{camList}}}</div>
                <div id="slider" style="width: 0%; height: 0%; position: relative;">{{{mediaList}}}</div>
                <div id="slider2" style="width: 0%; height: 0%; position: relative;">{{{mediaList2}}}</div>                                
              </div>
            </div>
          </body>
      </html>`;
    const template2 = Handlebars.compile(source);
    const data = {
      mediaList,
      mediaList2,
      webList,
      camList,
      cityList,
      tempUnit,
      windUnit,
      weatherType,
      backgroundColor,
      weatherList,
    };
    const result = template2(data);
    const storeIn = await this.storeInHtml(templateContent.id, result);
    return storeIn;
  }

  /**
   * @模板K
   */
  async createPublishTemplateK(
    templateContent: GetTemplateContent,
    templateType: string,
    groupId: string,
    token: string,
  ): Promise<string> {
    let mediaList = '';
    let mediaList2 = '';
    let webList = '';
    let camList = '';
    let windUnit = '';
    let tempUnit = '';
    let backgroundColor = '';
    const cityList: string[] = [];
    let weatherType = '';
    let weatherLayout = '';
    let weatherList = '';
    // let weather = '';
    const webPageList = '';
    for (const tpContent of templateContent.templateContent) {
      if (tpContent.templateContentDetail.weather) {
        backgroundColor =
          tpContent.templateContentDetail.weather.backgroundColor;
        tempUnit =
          tpContent.templateContentDetail.weather.temperatureUnit ?? 'C'; //C or F
        windUnit = tpContent.templateContentDetail.weather.windSpeedUnit ?? 'K'; //K or F
        switch (tpContent.templateContentDetail.weather.weatherStyleId) {
          case '628dd82d1df620dbe862924d':
            console.log('This is weatherType 1');
            weatherType = '1';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV1(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924e':
            console.log('This is weatherType 2');
            weatherType = '2';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV2(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924f':
            console.log('This is weatherType 3');
            weatherType = '3';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV3(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          default:
            console.log('This is not support your weatherType.');
        }
      }
      if (
        tpContent.templateContentDetail.media &&
        tpContent.templateContentDetail.media.length > 0
      ) {
        if (tpContent.rectId === 'rect2') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList = mediaList.concat(srcImg);
          }
        }
        if (tpContent.rectId === 'rect3') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList2 = mediaList2.concat(srcImg);
          }
        }
      }
      if (
        tpContent.templateContentDetail.webpage &&
        tpContent.templateContentDetail.webpage.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.webpage) {
          const url = w.webUrl;
          const webSrc = `<iframe src=${url} style="position: absolute"></iframe>`;
          webList = webList.concat(webSrc);
        }
      }
      if (
        tpContent.templateContentDetail.cam &&
        tpContent.templateContentDetail.cam.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.cam) {
          const url = w.rtspUrl;
          const camSrc = `<video id="ip_cam" data-url=${url}></video>`;
          camList = camList.concat(camSrc);
        }
      }
    }

    const source = `<html>
      <head>
        <link rel="stylesheet" type="text/css" href="./publish.css">
        <script defer src="./publish2.js"></script>
        <script defer src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script> 
      </head>
          <body>
          <div id="cityList" style="display:none">{{cityList}}</div>
          <div id="tempUnit" style="display:none">{{tempUnit}}</div>
          <div id="windUnit" style="display:none">{{windUnit}}</div>
          <div id="weatherType" style="display:none">{{weatherType}}</div>
          <div id="backgroundColor" style="display:none">{{backgroundColor}}</div>
          <div id="templateType" style="display:none">${templateType}</div>
            <div id="container" style="width: 1920px; height: 1080px; margin: 0 auto;">
              <div id="cover" class="coverflow">
                <div style="width: 50%; height: 50%; border-right: 10px solid transparent">
                  <div id="weather" style="height: 100%; position: relative;">{{{weatherList}}}</div>
                </div>
                <div class="section3" style="width: 50%; height: 50%;">{{{camList}}}</div>
                <div id="slider2" style="width: 100%; height: 49%; position: relative; border-top: 10px solid transparent">{{{mediaList2}}}</div>
                <div id="slider" style="width: 0%; height: 0%; position: relative; border-top: 10px solid transparent">{{{mediaList}}}</div>
                <div id="web" style="width: 0%; height: 0%;  position: relative;">{{{webList}}}</div>
              </div>
            </div>
          </body>
      </html>`;
    const template2 = Handlebars.compile(source);
    const data = {
      mediaList,
      mediaList2,
      webList,
      camList,
      cityList,
      tempUnit,
      windUnit,
      weatherType,
      backgroundColor,
      weatherList,
    };
    const result = template2(data);
    const storeIn = await this.storeInHtml(templateContent.id, result);
    return storeIn;
  }

  /**
   * @模板L
   */
  async createPublishTemplateL(
    templateContent: GetTemplateContent,
    templateType: string,
    groupId: string,
    token: string,
  ): Promise<string> {
    let mediaList = '';
    let mediaList2 = '';
    let webList = '';
    let camList = '';
    let windUnit = '';
    let tempUnit = '';
    let backgroundColor = '';
    const cityList: string[] = [];
    let weatherType = '';
    let weatherLayout = '';
    let weatherList = '';
    // let weather = '';
    const webPageList = '';
    for (const tpContent of templateContent.templateContent) {
      if (tpContent.templateContentDetail.weather) {
        backgroundColor =
          tpContent.templateContentDetail.weather.backgroundColor;
        tempUnit =
          tpContent.templateContentDetail.weather.temperatureUnit ?? 'C'; //C or F
        windUnit = tpContent.templateContentDetail.weather.windSpeedUnit ?? 'K'; //K or F
        switch (tpContent.templateContentDetail.weather.weatherStyleId) {
          case '628dd82d1df620dbe862924d':
            console.log('This is weatherType 1');
            weatherType = '1';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV1(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924e':
            console.log('This is weatherType 2');
            weatherType = '2';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV2(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          case '628dd82d1df620dbe862924f':
            console.log('This is weatherType 3');
            weatherType = '3';
            for (const city of tpContent.templateContentDetail.weather.citys) {
              const cityName = await this.eSignageCMRepository.getCityNamebyId(
                new Types.ObjectId(city),
              );
              cityList.push(cityName);
            }
            for (const c of cityList) {
              weatherLayout = this.cityWeatherV3(cityList.indexOf(c));
              weatherList = weatherList.concat(weatherLayout);
            }
            break;
          default:
            console.log('This is not support your weatherType.');
        }
      }
      if (
        tpContent.templateContentDetail.media &&
        tpContent.templateContentDetail.media.length > 0
      ) {
        if (tpContent.rectId === 'rect2') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList = mediaList.concat(srcImg);
          }
        }
        if (tpContent.rectId === 'rect3') {
          for (const m of tpContent.templateContentDetail.media) {
            const srcImg = await this.getImageById(groupId, token, m.mediaId);
            mediaList2 = mediaList2.concat(srcImg);
          }
        }
      }
      if (
        tpContent.templateContentDetail.webpage &&
        tpContent.templateContentDetail.webpage.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.webpage) {
          const url = w.webUrl;
          const webSrc = `<iframe src=${url} style="position: absolute"></iframe>`;
          webList = webList.concat(webSrc);
        }
      }
      if (
        tpContent.templateContentDetail.cam &&
        tpContent.templateContentDetail.cam.length > 0
      ) {
        for (const w of tpContent.templateContentDetail.cam) {
          const url = w.rtspUrl;
          const camSrc = `<video id="ip_cam" data-url=${url}></video>`;
          camList = camList.concat(camSrc);
        }
      }
    }

    const source = `<html>
      <head>
        <link rel="stylesheet" type="text/css" href="./publish.css">
        <script defer src="./publish2.js"></script>
        <script defer src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script> 
      </head>
          <body>
          <div id="cityList" style="display:none">{{cityList}}</div>
          <div id="tempUnit" style="display:none">{{tempUnit}}</div>
          <div id="windUnit" style="display:none">{{windUnit}}</div>
          <div id="weatherType" style="display:none">{{weatherType}}</div>
          <div id="backgroundColor" style="display:none">{{backgroundColor}}</div>
          <div id="templateType" style="display:none">${templateType}</div>
            <div id="container" style="width: 1920px; height: 1080px; margin: 0 auto;">
              <div id="cover" class="coverflow">
                <div id="web" style="width: 50%; height: 100%; position: relative; border-right: 10px solid transparent">{{{webList}}}</div>
                <div style="width: 50%; height: 100%;">
                  <div id="slider" style="width: 100%; height: 49%; position: relative;">{{{mediaList}}}</div>
                  <div class="section3" style="width: 100%; height: 49%; border-top: 10px solid transparent">{{{camList}}}</div>
                 </div>
                <div style="width: 0%; height: 0%;">
                  <div id="weather" style="height: 100%; position: relative;">{{{weatherList}}}</div>
                </div>
                <div id="slider2" style="width: 0%; height: 0%; position: relative;">{{{mediaList2}}}</div>                                
              </div>
            </div>
          </body>
      </html>`;
    const template2 = Handlebars.compile(source);
    const data = {
      mediaList,
      mediaList2,
      webList,
      camList,
      cityList,
      tempUnit,
      windUnit,
      weatherType,
      backgroundColor,
      weatherList,
    };
    const result = template2(data);
    const storeIn = await this.storeInHtml(templateContent.id, result);
    return storeIn;
  }

  async storeInHtml(id: string, htmlCode: string): Promise<string> {
    const port = process.env.PORT || 4000;
    const host = process.env.HOST || 'localhost';
    const DEFAULT_DIRECTORY = 'src/public/preview/' + id + '.html';
    fs.writeFile(DEFAULT_DIRECTORY, htmlCode, function (error) {
      if (error) {
        console.log('html文件寫入失敗' + error.message);
        return false;
      } else {
        console.log('文件寫入成功');
      }
    });
    const dir = this.configService.get<string>('ESIGNAGE_FILE_DIRECTOR');
    const fileDirector = dir + id + '.html';
    // const fileDirector =
    //   `https://cityos-dev.chtiss.com:7777/preview/` + id + '.html';
    return fileDirector;
  }

  async setContent(
    groupId: string,
    token: string,
    templateId: string,
    templateContent: GetTemplateContent,
  ): Promise<string> {
    const template: EsignageTemplate =
      await this.eSignageCMRepository.getTemplateByTemplateId(
        new Types.ObjectId(templateId),
      );
    let url = '';
    switch (template.templateTypeId.toString()) {
      case '62962106c61bfbb10cedd731':
        console.log('This is templateType A');
        url = await this.createPublishTemplateA(
          templateContent,
          'A',
          groupId,
          token,
        );
        break;
      case '62962106c61bfbb10cedd732':
        console.log('This is templateType B');
        url = await this.createPublishTemplateB(
          templateContent,
          'B',
          groupId,
          token,
        );
        break;
      case '62962106c61bfbb10cedd733':
        console.log('This is templateType C');
        url = await this.createPublishTemplateC(
          templateContent,
          'C',
          groupId,
          token,
        );
        break;
      case '62962106c61bfbb10cedd734':
        console.log('This is templateType D');
        url = await this.createPublishTemplateD(
          templateContent,
          'D',
          groupId,
          token,
        );
        break;
      case '62962106c61bfbb10cedd735':
        console.log('This is templateType E');
        url = await this.createPublishTemplateE(
          templateContent,
          'E',
          groupId,
          token,
        );
        break;
      case '62962106c61bfbb10cedd736':
        console.log('This is templateType F');
        url = await this.createPublishTemplateF(
          templateContent,
          'F',
          groupId,
          token,
        );
        break;
      case '62962106c61bfbb10cedd737':
        console.log('This is templateType G');
        url = await this.createPublishTemplateG(
          templateContent,
          'G',
          groupId,
          token,
        );
        break;
      case '62962106c61bfbb10cedd738':
        console.log('This is templateType H');
        url = await this.createPublishTemplateH(
          templateContent,
          'H',
          groupId,
          token,
        );
        break;
      case '62962106c61bfbb10cedd739':
        console.log('This is templateType I');
        url = await this.createPublishTemplateI(
          templateContent,
          'I',
          groupId,
          token,
        );
        break;
      case '62962106c61bfbb10cedd73a':
        console.log('This is templateType J');
        url = await this.createPublishTemplateJ(
          templateContent,
          'J',
          groupId,
          token,
        );
        break;
      case '62962106c61bfbb10cedd73b':
        console.log('This is templateType K');
        url = await this.createPublishTemplateK(
          templateContent,
          'K',
          groupId,
          token,
        );
        break;
      case '62962106c61bfbb10cedd73c':
        console.log('This is templateType L');
        url = await this.createPublishTemplateL(
          templateContent,
          'L',
          groupId,
          token,
        );
        break;
      default:
        console.log('This is not support your templateType.');
    }
    return url;
  }

  //string format:2022/08/17
  async stringToDate(stringDate: string): Promise<Date> {
    const [dateValues, timeValues] = stringDate.split(' ');
    const [year, month, day] = dateValues.split('/');
    // const [hours, minutes, seconds] = timeValues.split(':');
    const date = new Date(+year, +month - 1, +day);
    return date;
  }

  //string format:2022/08/17 12:12:59
  async formatScheduleDownloadDateTime(stringDate: string): Promise<Date> {
    const [dateValues, timeValues] = stringDate.split(' ');
    const [year, month, day] = dateValues.split('/');
    const [hours, minutes, seconds] = timeValues.split(':');
    const date = new Date(+year, +month - 1, +day, +hours, +minutes, +seconds);
    return date;
  }

  async getWeatherDataByCity(cityId: string): Promise<GetWeatherData> {
    const cityName = await this.eSignageCMRepository.getCityNamebyId(
      new Types.ObjectId(cityId),
    );
    const weatherDataRes = await this.getWeatherData(cityName);
    return weatherDataRes;
  }

  async getWeatherData(cityName: string): Promise<GetWeatherData> {
    const options = {
      headers: {},
    };
    const apiKey = this.configService.get<string>('OPENWEATHER_API_KEY');
    const WeatherResponse: GetWeatherData = await this.httpService
      .get(
        `https://api.openweathermap.org/data/2.5/weather?q=${cityName}&appid=${apiKey}`,
        options,
      )
      .toPromise()
      .then((res: AxiosResponse<GetWeatherData>) => res.data)
      .catch((error: AxiosError<WeatherDataError>) => {
        throw new ApolloError(
          `Get WeatherData from OpenWeather with error: ${error.response?.data?.message}.`,
          ErrorCode.OPENWEATHER_API_ERROR,
        );
      });
    return WeatherResponse;
  }
}
