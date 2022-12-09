import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApolloError } from 'apollo-server-express';
import { DateTime } from 'luxon';
import { Constants } from 'src/constants';
import { Device } from 'src/models/device';
import { ErrorCode } from 'src/models/error.code';
import {
  CameraEventConnection,
  CameraEventEdge,
  CameraEventFilter,
  CameraEventSortField,
  RecognitionType,
  CarIdentifyEvent,
  DeviceType,
  GetVideoURLPayload,
  HumanFlowAdvanceEvent,
  HumanShapeEvent,
  KeepVideoAlivePayload,
  LiveStream,
  LiveViewConfigInput,
  PageInfo,
  SortOrder,
  GetVideoHistoryPayload,
  VideoClip,
} from 'src/graphql.schema';
import axios, { AxiosResponse } from 'axios';
import { DeviceService } from '../device/device.service';
import { User } from 'src/models/user';
import {
  LiveView,
  LiveViewConfig,
  LiveViewDocument,
} from 'src/models/liveview';
import { ElasticsearchSensorService } from '../elasticsearch-sensor/elasticsearch-sensor.service';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import {
  SearchResponse,
  TotalHits,
  Hit,
  HitsMetadata,
} from '@elastic/elasticsearch/api/types';
import StringUtils from 'src/utils/StringUtils';
import { ESCameraEvent } from 'src/es.models/es.camera.event';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

interface SingleFilter {
  term?: any;
  regexp?: any;
}

@Injectable()
export class CameraService {
  private apiUrl: string;

  private apiUsername: string;

  private apiPassword: string;

  private readonly logger = new Logger(CameraService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private deviceService: DeviceService,
    @InjectModel(LiveView.name)
    private readonly liveViewModel: Model<LiveViewDocument>,
    private readonly elasticsearchService: ElasticsearchService,
    private readonly elasticsearchSensorService: ElasticsearchSensorService,
  ) {
    this.apiUrl = this.configService.get<string>('CHT_CAMERA_SERVER_URI');
    this.apiUsername = this.configService.get<string>(
      'CHT_CAMERA_SERVER_USERNAME',
    );
    this.apiPassword = this.configService.get<string>(
      'CHT_CAMERA_SERVER_PASSWORD',
    );
  }

  async getVideoURL(deviceIds: string[]): Promise<GetVideoURLPayload> {
    const devices = await this.deviceService.getDeviceByIds(deviceIds);

    if (deviceIds.length !== devices?.length) {
      throw new ApolloError(
        `Some of devices are not in the database.`,
        ErrorCode.DEVICE_NOT_FOUND,
      );
    }

    const token = await this.getToken();
    return this.getLive(devices, token);
  }

  async keepVideoAlive(
    token: string,
    urlTokenList: string[],
  ): Promise<KeepVideoAlivePayload> {
    this.logger.debug(
      `Extend expired time with query: ${this.apiUrl}/camera/keepUrlAlive`,
    );
    /** ***
     * The Extend Expired Time Responses :
     * {
     *   "data": [],
     *   "status": true,
     *   "code": 200,
     *   "message": "Success."
     * }
     */

    const options = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };

    interface KeepUrlAliveResponse {
      status: boolean;
      code: number;
      message: string;
    }

    const result = await Promise.all(
      urlTokenList.map(async (urlToken) => {
        const params = {
          urlToken,
        };
        const query = StringUtils.encodeQueryParameters(params);

        try {
          return await this.httpService
            .post(`${this.apiUrl}/camera/keepUrlAlive?${query}`, null, options)
            .toPromise()
            .then((res: AxiosResponse<KeepUrlAliveResponse>) => res.data);
        } catch (error) {
          if (axios.isAxiosError(error)) {
            this.logger.error(
              `extend expired time from the CHT failed with status = ${error.response.status}: ${error.message}`,
            );
          }
          throw new ApolloError(
            `Extend expired time from the CHT failed. token is not correct.`,
            ErrorCode.CHT_CAMERA_API_ERROR,
          );
        }
      }),
    );

    const success = result.every((r) => r.code === 200);
    if (success) {
      const payload = new KeepVideoAlivePayload();
      payload.expiredAt = DateTime.now()
        .plus({ minute: Constants.CHT_CAMERA_EXTEND_IN_MINUTES })
        .toJSDate();
      return payload;
    } else {
      const message = result.map((it) => it.message).toString();
      throw new ApolloError(
        `Extend expired time from the CHT failed. urlTokenList is not correct. (${message})`,
        ErrorCode.CHT_CAMERA_API_ERROR,
      );
    }
  }

  async getVideoHistory(
    device: Device,
    from: Date,
    to: Date,
  ): Promise<GetVideoHistoryPayload> {
    const token = await this.getToken();
    return this.getPlaybackFromIVS(device, from, to, token);
  }

  async readLiveViewConfig(user: User): Promise<LiveViewConfig> {
    const group = user.groupInUse();
    const pLiveview = await this.liveViewModel.findOne({
      user: user._id,
      group: group._id,
    });
    if (pLiveview) {
      return pLiveview.config;
    } else {
      return new LiveViewConfig();
    }
  }

  async saveLiveViewConfig(
    user: User,
    input: LiveViewConfigInput,
  ): Promise<LiveViewConfig> {
    const group = user.groupInUse();
    this.logger.log(
      `${user.email} saveLiveViewConfig for (${group.name}, ${
        group.id
      }) ${JSON.stringify(input)}`,
    );

    const pLiveview = await this.liveViewModel.findOne({
      user: user._id,
      group: group._id,
    });

    if (pLiveview) {
      const config = new LiveViewConfig();
      config.devices = input.devices || pLiveview.config.devices;
      config.splitMode = input.splitMode || pLiveview.config.splitMode;
      config.autoplay =
        input.autoplay === null || input.autoplay === undefined
          ? pLiveview.config.autoplay
          : input.autoplay;
      config.autoplayInSeconds =
        input.autoplayInSeconds || pLiveview.config.autoplayInSeconds;

      const mongoLiveView = await this.liveViewModel.findOneAndUpdate(
        {
          user: user._id,
          group: group._id,
        },
        {
          config,
        },
        {
          new: true,
        },
      );
      return mongoLiveView.config;
    } else {
      const liveview = new LiveView();

      const config = new LiveViewConfig();
      config.devices = input.devices;
      config.splitMode = input.splitMode;
      config.autoplay = input.autoplay;
      config.autoplayInSeconds = input.autoplayInSeconds;

      liveview.user = user;
      liveview.group = group;
      liveview.config = config;

      const mongoLiveView = await this.liveViewModel.create(liveview);
      return mongoLiveView.config;
    }
  }

  async cameraEventHistory(
    groupId: string,
    filter: CameraEventFilter,
    size: number,
    after?: string,
    before?: string,
  ): Promise<CameraEventConnection> {
    const devices = await this.deviceService.getDevicesUnderGroup(
      groupId,
      DeviceType.CAMERA,
    );

    const eventConditions: SingleFilter[] = [];
    switch (filter.type) {
      case RecognitionType.HUMAN_SHAPE: {
        if (filter.humanShapeFilterInput?.gender) {
          eventConditions.push({
            term: {
              gender: filter.humanShapeFilterInput.gender,
            },
          });
        }
        if (filter.humanShapeFilterInput?.clothesColor) {
          eventConditions.push({
            term: {
              clothesColor: filter.humanShapeFilterInput.clothesColor,
            },
          });
        }
        break;
      }
      case RecognitionType.CAR_IDENTIFY: {
        if (filter.carIdentifyFilterInput?.numberPlate) {
          eventConditions.push({
            regexp: {
              numberPlate: `.*${filter.carIdentifyFilterInput.numberPlate}.*`,
            },
          });
        }
        if (filter.carIdentifyFilterInput?.vehicleType) {
          eventConditions.push({
            term: {
              vehicleType: filter.carIdentifyFilterInput.vehicleType,
            },
          });
        }
        if (filter.carIdentifyFilterInput?.vehicleColor) {
          eventConditions.push({
            term: {
              vehicleColor: filter.carIdentifyFilterInput.vehicleColor,
            },
          });
        }
        break;
      }
      case RecognitionType.HUMAN_FLOW_ADVANCE: {
        if (filter.humanFlowAdvanceFilterInput?.humanFlowSex) {
          eventConditions.push({
            term: {
              human_flow_sex: filter.humanFlowAdvanceFilterInput.humanFlowSex,
            },
          });
        }
        if (!(filter.humanFlowAdvanceFilterInput?.humanFlowAge == null)) {
          eventConditions.push({
            term: {
              human_flow_age: filter.humanFlowAdvanceFilterInput.humanFlowAge,
            },
          });
        }
        break;
      }
    }

    const sortField = filter.sortField || CameraEventSortField.TIME;
    const sortOrder = filter.sortOrder || SortOrder.DESCENDING;

    let searchAfter = {};
    if (after || before) {
      const searchAfterArray = this.decodeFromCursor(after || before);
      if (!searchAfterArray) {
        throw new ApolloError(
          'The after or before you provided is not correct.',
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      }
      searchAfter = {
        search_after: searchAfterArray,
      };
    }

    const elasticFilter = [
      {
        terms: {
          deviceId: devices
            .map((d) => d.deviceId)
            .filter((id) => {
              if (filter.deviceIds) {
                return filter.deviceIds.includes(id);
              } else {
                return true;
              }
            }),
        },
      },
      filter.type
        ? {
            term: {
              type: filter.type.toLowerCase(),
            },
          }
        : {
            terms: {
              type: [
                Constants.VALUE_ATTR_HUMAN_SHAPE,
                Constants.VALUE_ATTR_CAR_IDENTIFY,
                Constants.VALUE_ATTR_HUMAN_FLOW_ADVANCE,
              ],
            },
          },
      {
        range: {
          time: {
            gte: StringUtils.dateToTimestampMilli(filter.from),
            lt: StringUtils.dateToTimestampMilli(filter.to),
          },
        },
      },
      ...eventConditions,
    ];

    const hits = await this.elasticsearchQueryForCameraEvents(
      size,
      elasticFilter,
      sortField,
      sortOrder,
      searchAfter,
      before ? true : false,
    );

    const connection = new CameraEventConnection();

    const edges: CameraEventEdge[] = [];
    let index = 0;
    hits.hits.forEach((hit) => {
      const data = hit._source;
      const edge = new CameraEventEdge();

      switch (data.type) {
        case Constants.VALUE_ATTR_HUMAN_SHAPE: {
          const event = new HumanShapeEvent();
          event.deviceId = data.deviceId;
          event.deviceName = devices.find(
            (it) => it.deviceId === data.deviceId,
          ).name;
          event.type = RecognitionType.HUMAN_SHAPE;
          event.time = new Date(data.time);
          event.pedestrian = data.pedestrian;
          event.clothesColor = data.clothesColor;
          event.gender = data.gender;
          edge.cursor = this.encodeAsCursor(sortField, hit);
          edge.node = event;
          break;
        }
        case Constants.VALUE_ATTR_CAR_IDENTIFY: {
          const event = new CarIdentifyEvent();
          event.deviceId = data.deviceId;
          event.deviceName = devices.find(
            (it) => it.deviceId === data.deviceId,
          ).name;
          event.type = RecognitionType.CAR_IDENTIFY;
          event.time = new Date(data.time);
          event.vehicle = data.vehicle;
          event.numberPlate = data.numberPlate;
          event.vehicleType = data.vehicleType;
          event.vehicleColor = data.vehicleColor;
          edge.cursor = this.encodeAsCursor(sortField, hit);
          edge.node = event;
          break;
        }
        case Constants.VALUE_ATTR_HUMAN_FLOW_ADVANCE: {
          const event = new HumanFlowAdvanceEvent();
          event.deviceId = data.deviceId;
          event.deviceName = devices.find(
            (it) => it.deviceId === data.deviceId,
          ).name;
          event.type = RecognitionType.HUMAN_FLOW_ADVANCE;
          event.time = new Date(data.time);
          event.humanFlowSex = data.human_flow_sex;
          event.humanFlowAge = data.human_flow_age;
          event.humanFlowImage = data.human_flow_image;
          edge.cursor = this.encodeAsCursor(sortField, hit);
          edge.node = event;
          break;
        }
      }
      index += 1;
      if (index < size + 1) {
        edges.push(edge);
      }
    });

    const pageInfo = new PageInfo();
    if (before) {
      edges.reverse();

      pageInfo.hasPreviousPage = hits.hits.length === size + 1;
      pageInfo.beforeCursor = edges[0]?.cursor;

      pageInfo.endCursor = edges[edges.length - 1]?.cursor;
      if (pageInfo.endCursor) {
        const afterHits = await this.elasticsearchQueryForCameraEvents(
          size,
          elasticFilter,
          sortField,
          sortOrder,
          { search_after: this.decodeFromCursor(pageInfo.endCursor) },
          false,
        );
        pageInfo.hasNextPage = afterHits.hits.length > 0;
      } else {
        pageInfo.hasNextPage = false;
      }
    } else {
      pageInfo.hasNextPage = hits.hits.length === size + 1;
      pageInfo.endCursor = edges[edges.length - 1]?.cursor;

      pageInfo.beforeCursor = edges[0]?.cursor;
      if (pageInfo.beforeCursor) {
        const beforeHits = await this.elasticsearchQueryForCameraEvents(
          size,
          elasticFilter,
          sortField,
          sortOrder,
          { search_after: this.decodeFromCursor(pageInfo.beforeCursor) },
          true,
        );
        pageInfo.hasPreviousPage = beforeHits.hits.length > 0;
      } else {
        pageInfo.hasPreviousPage = false;
      }
    }

    connection.totalCount = (hits.total as TotalHits).value;
    connection.pageInfo = pageInfo;
    connection.edges = edges;

    return connection;
  }

  private async elasticsearchQueryForCameraEvents(
    size: number,
    filter: any[],
    sortField: CameraEventSortField,
    sortOrder: SortOrder,
    searchAfter: any,
    reversed: boolean,
  ): Promise<HitsMetadata<ESCameraEvent>> {
    const sort = [];
    let order = '';
    switch (sortOrder) {
      case SortOrder.ASCENDING: {
        order = 'asc';
        if (reversed) {
          order = 'desc';
        }
        break;
      }
      case SortOrder.DESCENDING: {
        order = 'desc';
        if (reversed) {
          order = 'asc';
        }
        break;
      }
    }

    switch (sortField) {
      case CameraEventSortField.TIME: {
        sort.push({
          time: {
            order,
          },
        });
        break;
      }
      case CameraEventSortField.ID: {
        sort.push({
          deviceId: {
            order,
          },
        });
        break;
      }
      case CameraEventSortField.RECOGNITION_TYPE: {
        sort.push({
          type: {
            order,
          },
        });
        break;
      }
      case CameraEventSortField.GENDER: {
        sort.push({
          gender: {
            order,
          },
        });
        break;
      }
      case CameraEventSortField.CLOTHES_COLOR: {
        sort.push({
          clothesColor: {
            order,
          },
        });
        break;
      }
      case CameraEventSortField.VEHICLE_TYPE: {
        sort.push({
          vehicleType: {
            order,
          },
        });
        break;
      }
      case CameraEventSortField.VEHICLE_COLOR: {
        sort.push({
          vehicleColor: {
            order,
          },
        });
        break;
      }
      case CameraEventSortField.NUMBER_PLATE: {
        sort.push({
          numberPlate: {
            order,
          },
        });
        break;
      }
      case CameraEventSortField.HUMAN_FLOW_SEX: {
        sort.push({
          human_flow_sex: {
            order,
          },
        });
        break;
      }
      case CameraEventSortField.HUMAN_FLOW_AGE: {
        sort.push({
          human_flow_age: {
            order,
          },
        });
        break;
      }
    }

    const result = await this.elasticsearchService.search<
      SearchResponse<ESCameraEvent>
    >({
      index: this.elasticsearchSensorService.getIndexName(
        DeviceType.CAMERA,
        Constants.ID_CAMERA_PEDESTRIAN,
      ),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      body: {
        size: size + 1, // using size + 1 to indicate the hasNextPage
        query: {
          bool: {
            filter,
          },
        },
        sort: [
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          ...sort,
          {
            _id: {
              order: reversed ? 'desc' : 'asc',
            },
          },
        ],
        ...searchAfter,
      },
    });

    return result.body.hits;
  }

  private async getToken(): Promise<string> {
    /** ***
     * The Get Token Responses :
     * {
     *   "data": {
     *     "toke_type": "Bearer",
     *     "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczpcL1wvYXBpLml2cy5oaW5ldC5uZXQiLCJpYXQiOjE2NDYxMDIxOTgsImV4cCI6MTY0NjEwNTc5OCwibmJmIjoxNjQ2MTAyMTk4LCJqdGkiOiI0MEV3NFFUaGdRcm9JOWwyIiwic3ViIjo0NDcxMiwiYWNjb3VudCI6ImNhdC13ZWJhcGkiLCJpcCI6IjEyMy4xOTMuODUuMTY2In0.krDTS_rTWerreWXKISXhs_WDUCrf9ZhqHzBAiT-KKQg",
     *     "extra": {
     *       "RelayTicket": "1646132792-cat-webapi-d46b88a423c0ab4e77fec35c726d5f48"
     *     }
     *   },
     *   "status": true,
     *   "code": 200,
     *   "message": "Success."
     * }
     */

    const params = {
      account: this.apiUsername,
      password: this.apiPassword,
    };
    const query = StringUtils.encodeQueryParameters(params);

    interface CameraAuthResponse {
      data: {
        toke_type: string;
        token: string;
        extra: {
          RelayTicket: string;
        };
      };
      status: boolean;
      code: number;
      message: string;
    }

    const response = await this.httpService
      .post(`${this.apiUrl}/auth/jwt?${query}`, null)
      .toPromise()
      .then((res: AxiosResponse<CameraAuthResponse>) => res.data)
      .catch((error) => {
        if (axios.isAxiosError(error)) {
          this.logger.error(
            `get token from the CHT failed with status = ${error.response.status}: ${error.message}`,
          );
        }
        throw new ApolloError(
          `Get token from the CHT failed.`,
          ErrorCode.CHT_CAMERA_API_ERROR,
        );
      });

    this.logger.log(
      `Get token with query: ${this.apiUrl}/auth/jwt -> ${response.message}`,
    );

    return response.data?.token;
  }

  private async getLive(
    devices: Device[],
    token: string,
  ): Promise<GetVideoURLPayload> {
    // Get all camera ids
    const camIds = devices.flatMap((device) => {
      const camIdAttribute = device.attributes.find(
        (it) => it.key === Constants.KEY_ATTR_CAMERA_ID,
      );
      if (camIdAttribute?.value == null) {
        throw new ApolloError(
          `There is no ${Constants.KEY_ATTR_CAMERA_ID} for ${device.name}(${device.deviceId}) in attributes. Please check again.`,
          ErrorCode.CAMERA_ID_NOT_EXIST,
        );
      } else {
        return camIdAttribute.value;
      }
    });

    // Get live vide from CHT
    /** ***
     * The Get Live Responses :
     * {
     *   "data": {
     *    "urlToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uSWQiOiI5Y2JiYTM4MmIwMGQ0ODM4YjRmMGYwMTViMjRlZDMwNyIsImNhbUxpc3QiOiIxMTM2MDc2MDAyIiwidHlwZSI6ImxpdmUiLCJzdHJlYW1UeXBlIjoiaGxzIiwiZXhwIjoxNjQ2MTAyOTcyfQ.I8hb2LxAIuyvzfNoDZLISdvtKdIg8BUdgbmvMXXbC6M",
     *    "expireTime": "2022-03-01 10:59:32",
     *      "live": {
     *        "1136076002": {
     *          "url": "http://61.219.8.35:8080/live/cam1136076002/9cbba382b00d4838b4f0f015b24ed307/index.m3u8",
     *          "sUrl": "https://relay-61-219-8-35.vrs.hinet.net:443/live/cam1136076002/9cbba382b00d4838b4f0f015b24ed307/index.m3u8",
     *          "status": "1"
     *        },
     *        "76940647f1": {
     *          "url": "http://210.65.250.83:8080/live/cam76940647f1/56a22adeef40495d94be7dc656f785e8/index.m3u8",
     *          "sUrl": "https://relay-210-65-250-83.vrs.hinet.net:443/live/cam76940647f1/56a22adeef40495d94be7dc656f785e8/index.m3u8",
     *          "status": "1"
     *         }
     *      }
     *    },
     *    "status": true,
     *    "code": 200,
     *    "message": "Success."
     * }
     */

    const options = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };

    const params = {
      cid: camIds.toString(),
      streamType: 'hls',
    };
    const query = StringUtils.encodeQueryParameters(params);

    interface LiveResponse {
      data: {
        urlToken: string;
        expireTime: string;
        live: any;
      };
      status: string;
      code: string;
      message: string;
    }

    interface Live {
      url: string;
      sUrl: string;
      status: string;
    }

    const response = await this.httpService
      .post(`${this.apiUrl}/camera/live?${query}`, null, options)
      .toPromise()
      .then((res: AxiosResponse<LiveResponse>) => res.data)
      .catch((error) => {
        if (axios.isAxiosError(error)) {
          this.logger.error(
            `get live from the CHT failed with status = ${error.response.status}: ${error.message}`,
          );
        }
        throw new ApolloError(
          `Get live from the CHT failed.`,
          ErrorCode.CHT_CAMERA_API_ERROR,
        );
      });

    this.logger.log(
      `Get live with query: ${this.apiUrl}/camera/live -> ${response.message}`,
    );

    const payload = new GetVideoURLPayload();
    payload.token = token;
    const streamList: LiveStream[] = [];
    if (response.data) {
      payload.urlToken = response.data.urlToken;
      payload.expiredAt = this.toDate(response.data.expireTime);
      camIds.forEach((camId) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const liveData = response.data.live[camId] as Live;
        if (liveData) {
          const stream = new LiveStream();
          stream.camId = camId;
          stream.deviceId = devices.find((device) => {
            return device.attributes.some(
              (attr) =>
                attr.key === Constants.KEY_ATTR_CAMERA_ID &&
                attr.value === camId,
            );
          }).deviceId;
          stream.url = liveData.sUrl;

          streamList.push(stream);
        }
      });
    }

    payload.streamList = streamList;
    return payload;
  }

  private async getPlaybackFromIVS(
    device: Device,
    from: Date,
    to: Date,
    token: string,
  ): Promise<GetVideoHistoryPayload> {
    // get camId
    const camIdAttribute = device.attributes.find(
      (it) => it.key === Constants.KEY_ATTR_CAMERA_ID,
    );
    if (camIdAttribute?.value == null) {
      throw new ApolloError(
        `There is no ${Constants.KEY_ATTR_CAMERA_ID} for ${device.name}(${device.deviceId}) in attributes. Please check again.`,
        ErrorCode.CAMERA_ID_NOT_EXIST,
      );
    }
    const camId = camIdAttribute.value;

    interface PlaybackAPICall {
      filmDate?: string;
      startTime?: string;
      endTime?: string;
    }

    let current = DateTime.fromJSDate(from, {
      zone: this.configService.get<string>(
        'CHT_CAMERA_SERVER_TIMEZONE',
        'UTC+8',
      ),
    });

    // parse the from/date to FilmDate, StartTime, EndTime
    const apiCalls: PlaybackAPICall[] = [];
    let apiCall: PlaybackAPICall = {};
    apiCall.filmDate = this.parseToFilmDate(current);
    apiCall.startTime = this.parseToFilmTime(current);

    current = current.plus({ day: 1 }).startOf('day');
    while (current < DateTime.fromJSDate(to)) {
      const endTime = current.endOf('day');
      apiCall.endTime = this.parseToFilmTime(endTime);
      apiCalls.push(apiCall);

      apiCall = {};
      const startTime = current.startOf('day');
      apiCall.filmDate = this.parseToFilmDate(startTime);
      apiCall.startTime = this.parseToFilmTime(startTime);

      current = current.plus({ day: 1 }).startOf('day');
    }

    const endTime = DateTime.fromJSDate(to, {
      zone: this.configService.get<string>(
        'CHT_CAMERA_SERVER_TIMEZONE',
        'UTC+8',
      ),
    });
    apiCall.endTime = this.parseToFilmTime(endTime);
    apiCalls.push(apiCall);

    // call multiple apis to collect all playbacks
    const options = {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };

    interface PlayBackResponse {
      data: Array<{
        CamID: string;
        FileName: string;
        Url: string;
        sUrl: string;
        ErrorCode: string;
        Description: string;
      }>;
      status: string;
      code: string;
      message: string;
    }

    const allResponse = await Promise.all(
      apiCalls.map(async (input) => {
        const params = {
          CamID: camId,
          FilmType: 0,
          FilmDate: input.filmDate,
          StartTime: input.startTime,
          EndTime: input.endTime,
        };
        const query = StringUtils.encodeQueryParameters(params);

        this.logger.log(
          `Get playback with query: ${this.apiUrl}/camera/playbackOK?${query}`,
        );

        return this.httpService
          .post(`${this.apiUrl}/camera/playbackOK?${query}`, null, options)
          .toPromise()
          .then((res: AxiosResponse<PlayBackResponse>) => res.data)
          .catch((error) => {
            if (axios.isAxiosError(error)) {
              this.logger.error(
                `get playback from the CHT failed with status = ${error.response.status}: ${error.message}`,
              );
            }
            throw new ApolloError(
              `Get playback from the CHT failed.`,
              ErrorCode.CHT_CAMERA_API_ERROR,
            );
          });
      }),
    );

    const payload = new GetVideoHistoryPayload();
    payload.expiredAt = DateTime.now()
      .plus({ hour: Constants.CHT_CAMERA_PLAYBACK_EXPIRED_IN_HOURS })
      .toJSDate();
    payload.clips = [];

    for (const response of allResponse) {
      // response.data is not iterable when no data from IVS
      if (Symbol.iterator in Object(response.data)) {
        for (const data of response.data) {
          const clip = new VideoClip();
          clip.url = data.sUrl;
          clip.start = this.parseDateFromURL(data.sUrl);
          payload.clips.push(clip);
        }
      }
    }

    return payload;
  }

  private toDate(text: string): Date {
    return DateTime.fromFormat(text, 'yyyy-LL-dd hh:mm:ss', {
      setZone: true,
      zone: this.configService.get<string>(
        'CHT_CAMERA_SERVER_TIMEZONE',
        'UTC+8',
      ),
    }).toJSDate();
  }

  private encodeAsCursor(
    sortField: CameraEventSortField,
    hit: Hit<ESCameraEvent>,
  ): string {
    let searchAfter = '';
    switch (sortField) {
      case CameraEventSortField.TIME: {
        searchAfter = JSON.stringify([hit._source.time, hit._id]);
        break;
      }
      case CameraEventSortField.RECOGNITION_TYPE: {
        searchAfter = JSON.stringify([hit._source.type, hit._id]);
        break;
      }
      case CameraEventSortField.GENDER: {
        searchAfter = JSON.stringify([hit._source.gender, hit._id]);
        break;
      }
      case CameraEventSortField.CLOTHES_COLOR: {
        searchAfter = JSON.stringify([hit._source.clothesColor, hit._id]);
        break;
      }
      case CameraEventSortField.VEHICLE_TYPE: {
        searchAfter = JSON.stringify([hit._source.vehicleType, hit._id]);
        break;
      }
      case CameraEventSortField.VEHICLE_COLOR: {
        searchAfter = JSON.stringify([hit._source.vehicleColor, hit._id]);
        break;
      }
      case CameraEventSortField.NUMBER_PLATE: {
        searchAfter = JSON.stringify([hit._source.numberPlate, hit._id]);
        break;
      }
      case CameraEventSortField.HUMAN_FLOW_SEX: {
        searchAfter = JSON.stringify([hit._source.human_flow_sex, hit._id]);
        break;
      }
      case CameraEventSortField.HUMAN_FLOW_AGE: {
        searchAfter = JSON.stringify([hit._source.human_flow_age, hit._id]);
        break;
      }
    }
    return Buffer.from(searchAfter).toString('base64');
  }

  private decodeFromCursor(cursor: string): string[] {
    const data = Buffer.from(cursor, 'base64').toString('ascii');
    try {
      return JSON.parse(data) as string[];
    } catch (e) {
      return null;
    }
  }

  private parseDateFromURL(url: string): Date {
    const data = url.split('/');
    const time = data[data.length - 1].replace('.mp4', '');
    const date = data[data.length - 2];

    return DateTime.fromFormat(`${date}${time}`, 'yyyyLLddhhmmss', {
      setZone: true,
      zone: this.configService.get<string>(
        'CHT_CAMERA_SERVER_TIMEZONE',
        'UTC+8',
      ),
    }).toJSDate();
  }

  private parseToFilmDate(time: DateTime): string {
    return time.toFormat('yyyyMMdd');
  }

  private parseToFilmTime(time: DateTime): string {
    return time.toFormat('HHmm');
  }
}
