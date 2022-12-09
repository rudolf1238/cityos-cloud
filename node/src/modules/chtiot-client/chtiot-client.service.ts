import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApolloError } from 'apollo-server-express';
import { AxiosError, AxiosResponse } from 'axios';
import { Constants } from 'src/constants';
import { ActiveSetting } from 'src/models/active.setting';
import { Attribute, Device, GeoJSON } from 'src/models/device';
import { ErrorCode } from 'src/models/error.code';
import { Lamp, LightControl } from 'src/models/lamp';
import { Sensor } from 'src/models/sensor';
import {
  DeviceStatus,
  DeviceType,
  SensorType,
  BuildingInput,
  ExtremeOperation,
  GaugeSensorData,
  ISensorData,
  SnapshotSensorData,
  SwitchSensorData,
  TextSensorData,
} from 'src/graphql.schema';
import StringUtils from 'src/utils/StringUtils';
import { name } from 'agenda/dist/agenda/name';
import { HttpService } from '@nestjs/axios';

interface EditDeviceResponse {
  id: string;
}

interface CreateDeviceResponse {
  id: string;
}

interface AttributeReponse {
  key: string;
  value: string;
}

interface DeviceReponse {
  id: string;
  name: string;
  desc?: string;
  type: string;
  uri: string;
  lat?: number;
  lon?: number;
  attributes?: AttributeReponse[];
}

interface SensorReponse {
  id: string;
  name: string;
  desc?: string;
  type: string;
  uri: string;
  unit: string;
  formula?: string;
  attributes?: AttributeReponse[];
}

interface ActiveSettingReponse {
  deviceId: string;
  enable: boolean;
  period: string;
  minUploads: number;
  maxUploads: number;
  createTime: string;
}

interface ActiveStatusReponse {
  deviceId: string;
  status: string;
  createTime: Date;
}

interface ExpressionResponse {
  expressionIds: string[];
}

interface ProjectKeyResponse {
  key: string;
  permission: string;
}

interface CreateProjectResponse {
  id: string;
  name: string;
  desc?: string;
  uri: string;
  type: string;
  projectKeys: ProjectKeyResponse[];
}

interface SensorStatisticHistoryReponse {
  silence: boolean;
  id: string;
  start: Date;
  end: Date;
  interval: 60; // in minutes
  etl: StatisticValueReponse[];
}

interface StatisticValueReponse {
  start: string; // ISO 8601, ex: 2016-07-14T23:55:00Z
  end: string;
  count: number;
  sum: number;
  ignore: number;
  max: number;
  min: number;
  avg: number | string; // number or 'Nan'
  median: number | string; // number or 'Nan'
}

interface SensorRawHistoryReponse {
  id: string;
  deviceId: string;
  time: Date;
  lat: number;
  lon: number;
  value: string[];
}

interface IOTErrorData {
  status: string;
  message: string;
}

interface PlayerRespone {
  id: string;
  deviceId: string;
  time: Date;
  value: string[];
}

@Injectable()
export class ChtiotClientService {
  private apiUrl: string;

  private aepUrl: string;

  private aepKey: string;

  private readonly logger = new Logger(ChtiotClientService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.apiUrl = this.configService.get<string>('CHTIOT_SERVER_URI');
    this.aepUrl = this.configService.get<string>('CHTIOT_AEP_SERVER_URI');
    this.aepKey = this.configService.get<string>('CHTIOT_AEP_API_KEY');
  }

  async createDevice(
    projectKey: string,
    device: BuildingInput,
    attributes: Attribute,
  ): Promise<CreateDeviceResponse> {
    const options = {
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        CK: projectKey,
      },
    };

    const att = [];
    att.push(attributes[0]);
    att.push(attributes[1]);

    const data = {
      name: device.name,
      desc: device.desc || '',
      type: 'general',
      uri: '',
      lat: device.location?.lat || '',
      lon: device.location?.lng || '',
      attributes: att,
    };
    //log
    this.logger.log(
      `CreateDevice: ${this.apiUrl}/device/${device.name}\n${JSON.stringify(
        data,
      )}`,
    );

    const chtIotDeviceId = this.httpService
      .post(`${this.apiUrl}/device`, data, options)
      .toPromise()
      .then((res: AxiosResponse<CreateDeviceResponse>) => res.data)
      .catch((error: AxiosError) => {
        this.logger.error(
          `Create device in the IOT failed with error = ${error.message}.`,
        );
        throw new ApolloError(
          `Cannot create device - ${name} in the platform.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      });
    return chtIotDeviceId;
  }

  async updateDevice(
    projectKey: string,
    deviceId: string,
    device: BuildingInput,
    attributes: Attribute,
  ): Promise<EditDeviceResponse> {
    const options = {
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        CK: projectKey,
      },
    };

    const att = [];
    att.push(attributes[0]);
    att.push(attributes[1]);
    const data = {
      name: device.name,
      desc: device.desc,
      type: 'general',
      uri: '',
      lat: device.location?.lat || '',
      lon: device.location?.lng || '',
      attributes: att,
    };
    this.logger.log(
      `EditDevice: ${this.apiUrl}/device/${deviceId}\n${JSON.stringify(data)}`,
    );

    return this.httpService
      .put(`${this.apiUrl}/device/${deviceId}`, data, options)
      .toPromise()
      .then((res: AxiosResponse<EditDeviceResponse>) => res.data)
      .catch((error: AxiosError) => {
        this.logger.error(
          `update device in the IOT failed with error = ${error.message}.`,
        );
        if (error.response?.status === 406) {
          throw new ApolloError(
            `Cannot find deviceId - ${deviceId} in the platform.`,
            ErrorCode.DEVICE_NOT_FOUND,
          );
        } else {
          throw new ApolloError(
            `Update device in the IOT failed with error = ${error.message}.`,
            ErrorCode.CHTIOT_API_ERROR,
          );
        }
      });
  }

  async editDevice(
    projectKey: string,
    device: Device,
  ): Promise<EditDeviceResponse> {
    const options = {
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        CK: projectKey,
      },
    };
    const data = {
      name: device.name,
      desc: device.desc,
      type: 'general',
      lat: device.location?.coordinates[1] || '',
      lon: device.location?.coordinates[0] || '',
      attributes: device.attributes,
    };
    this.logger.log(
      `EditDevice: ${this.apiUrl}/device/${device.deviceId}\n${JSON.stringify(
        data,
      )}`,
    );

    return this.httpService
      .put(`${this.apiUrl}/device/${device.deviceId}`, data, options)
      .toPromise()
      .then((res: AxiosResponse<EditDeviceResponse>) => res.data)
      .catch((error: AxiosError<IOTErrorData>) => {
        this.logger.error(
          `update device in the IOT failed with error = ${error.response?.data?.message}.`,
        );
        if (error.response?.status === 406) {
          throw new ApolloError(
            `Cannot find deviceId - ${device.deviceId} in the platform.`,
            ErrorCode.DEVICE_NOT_FOUND,
          );
        } else {
          throw new ApolloError(
            `Update device in the IOT failed with error = ${error.response?.data?.message}.`,
            ErrorCode.CHTIOT_API_ERROR,
          );
        }
      });
  }

  async editSensor(
    projectKey: string,
    deviceId: string,
    sensor: Sensor,
  ): Promise<boolean> {
    const options = {
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        CK: projectKey,
      },
    };
    const data = {
      name: sensor.name,
      desc: sensor.desc,
      type: sensor.type.toLowerCase(),
      unit: sensor.unit,
      attributes: sensor.attributes,
    };
    this.logger.log(
      `EditSensor: ${this.apiUrl}/device/${deviceId}/sensor/${
        sensor.iotSensorId
      }\n${JSON.stringify(data)}`,
    );

    return !!(await this.httpService
      .put(
        `${this.apiUrl}/device/${deviceId}/sensor/${sensor.iotSensorId}`,
        data,
        options,
      )
      .toPromise()
      .catch((error: AxiosError<IOTErrorData>) => {
        throw new ApolloError(
          `Edit the sensor ${deviceId} (${sensor.iotSensorId}) fail with error ${error.response?.data?.message}.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      }));
  }

  async updateSensor(
    projectKey: string,
    deviceId: string,
    sensorId: string,
    value: any,
    date?: Date,
  ): Promise<boolean> {
    const options = {
      headers: {
        'Content-Type': 'application/json',
        CK: projectKey,
      },
    };
    const data = [
      {
        id: sensorId,
        value: [value],
        time: date?.toISOString() || new Date(),
      },
    ];
    this.logger.log(
      `UpdateSensor: ${
        this.apiUrl
      }/device/${deviceId}/rawdata\n${JSON.stringify(data)}`,
    );

    return !!(await this.httpService
      .post(`${this.apiUrl}/device/${deviceId}/rawdata`, data, options)
      .toPromise()
      .catch((error: AxiosError<IOTErrorData>) => {
        this.logger.error(
          `Update sensor in the IOT failed with error = ${error.response?.data?.message}`,
        );
        if (error.response?.status === 406) {
          throw new ApolloError(
            `Cannot find deviceId - ${deviceId} in the platform.`,
            ErrorCode.DEVICE_NOT_FOUND,
          );
        } else {
          throw new ApolloError(
            `Update sensor ${deviceId} (${sensorId}) fail with error ${error.response?.data?.message}.`,
            ErrorCode.CHTIOT_API_ERROR,
          );
        }
      }));
  }

  async getDevices(
    projectKey: string,
    ids?: string[],
    type?: DeviceType,
    name?: string,
    desc?: string,
  ): Promise<Device[]> {
    const options = {
      headers: {
        accept: 'application/json',
        CK: projectKey,
      },
    };
    let params = {};
    if (ids) params = { ...params, id: ids.join(',') };
    if (name) params = { ...params, name };
    if (desc) params = { ...params, desc };
    if (type) {
      params = {
        ...params,
        sk: Constants.KEY_ATTR_DEVICE_TYPE,
        sv: StringUtils.stringFromType(type),
      };
    }

    const query = StringUtils.encodeQueryParameters(params);
    this.logger.log(`GetDevices: ${this.apiUrl}/device?${query}`);

    const response = await this.httpService
      .get(`${this.apiUrl}/device?${query}`, options)
      .toPromise()
      .then((res: AxiosResponse<DeviceReponse[]>) => res.data)
      .catch((error: AxiosError<IOTErrorData>) => {
        this.logger.error(
          `get devices from the IOT failed with error = ${error.response?.data?.message}`,
        );
        throw new ApolloError(
          `Get devices from IOT with error: ${error.response?.data?.message}.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      });
    return this.convertToDevices(response);
  }

  async deleteDevice(projectKey: string, deviceId: string): Promise<boolean> {
    const options = {
      headers: {
        accept: 'application/json',
        CK: projectKey,
      },
    };

    this.logger.log(`DeleteDevice: ${this.apiUrl}/device/${deviceId}`);

    return !!(await this.httpService
      .delete(`${this.apiUrl}/device/${deviceId}`, options)
      .toPromise()
      .catch((error: AxiosError<IOTErrorData>) => {
        this.logger.error(
          `Delete device in the IOT failed with error = ${error.response?.data?.message}`,
        );
        throw new ApolloError(
          `Delete device from IOT with error: ${error.response?.data?.message}.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      }));
  }

  async getPlayerName(
    projectKey: string,
    deviceId: string,
  ): Promise<PlayerRespone> {
    const options = {
      headers: {
        accept: 'application/json',
        CK: projectKey,
      },
    };
    this.logger.log(
      `GetSensors: ${this.apiUrl}/device/${deviceId}/sensor/player_name/rawdata`,
    );

    const response = await this.httpService
      .get(
        `${this.apiUrl}/device/${deviceId}/sensor/player_name/rawdata`,
        options,
      )
      .toPromise()
      .then((res: AxiosResponse<PlayerRespone>) => res.data)
      .catch((error: AxiosError<IOTErrorData>) => {
        this.logger.error(
          `get devices from the IOT failed with error = ${error.response?.data?.message}`,
        );
        throw new ApolloError(
          `Get sensors from IOT with error: ${error.response?.data?.message}.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      });
    return response;
  }

  async getSensors(projectKey: string, deviceId: string): Promise<Sensor[]> {
    const options = {
      headers: {
        accept: 'application/json',
        CK: projectKey,
      },
    };
    this.logger.log(`GetSensors: ${this.apiUrl}/device/${deviceId}/sensor`);

    const response = await this.httpService
      .get(`${this.apiUrl}/device/${deviceId}/sensor`, options)
      .toPromise()
      .then((res: AxiosResponse<SensorReponse[]>) => res.data)
      .catch((error: AxiosError<IOTErrorData>) => {
        this.logger.error(
          `get devices from the IOT failed with error = ${error.response?.data?.message}`,
        );
        throw new ApolloError(
          `Get sensors from IOT with error: ${error.response?.data?.message}.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      });
    return this.convertToSensors(response);
  }

  async editActiveSetting(
    projectKey: string,
    deviceId: string,
    activeSetting: ActiveSetting,
  ): Promise<ActiveSettingReponse> {
    const options = {
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        CK: projectKey,
      },
    };
    const data = {
      deviceId,
      enable: true,
      period: activeSetting.period,
      minUploads: activeSetting.minUploads,
      maxUploads: activeSetting.maxUploads,
    };
    this.logger.log(
      `EditActiveSetting: ${
        this.apiUrl
      }/device/${deviceId}/active/setting\n${JSON.stringify(data)}`,
    );

    return this.httpService
      .post(`${this.apiUrl}/device/${deviceId}/active/setting`, data, options)
      .toPromise()
      .then((res: AxiosResponse<ActiveSettingReponse>) => res.data)
      .catch((error: AxiosError<IOTErrorData>) => {
        throw new ApolloError(
          `EditActiveSetting ${deviceId} fail with error ${error.response?.data?.message}.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      });
  }

  async getActiveStatus(
    projectKey: string,
    deviceId: string,
  ): Promise<DeviceStatus> {
    const options = {
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        CK: projectKey,
      },
    };
    this.logger.log(
      `GetActiveStatus: ${this.apiUrl}/device/${deviceId}/active/setting`,
    );

    const response = await this.httpService
      .get(`${this.apiUrl}/device/${deviceId}/active`, options)
      .toPromise()
      .then((res: AxiosResponse<ActiveStatusReponse>) => res.data)
      .catch((error: AxiosError<IOTErrorData>) => {
        throw new ApolloError(
          `GetActiveStatus ${deviceId} fail with error ${error.response?.data?.message}.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      });

    // XXX: force to set the status of device to active
    if (this.configService.get<string>('DEVICE_FORCE_ACTIVE', '0') === '1') {
      const ignoreDeviceList = JSON.parse(
        this.configService.get<string>('IGNORE_DEVICE_FORCE_ACTIVE', '[]'),
      ) as string[];
      if (ignoreDeviceList.includes(response.deviceId)) {
        return StringUtils.deviceStatusFrom(response?.status);
      }
      return DeviceStatus.ACTIVE;
    }
    return StringUtils.deviceStatusFrom(response?.status);
  }

  async addExpression(
    projectKey: string,
    lamp: Lamp,
    environment: Device,
  ): Promise<string[]> {
    const options = {
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        CK: projectKey,
      },
    };

    const conditions = lamp.lightSchedule.lightSensor.lightSensorCondition;
    conditions.sort((a, b) => {
      return a.lessThan - b.lessThan;
    });

    const data = [];
    let from = 0;
    conditions.forEach((condition) => {
      const expression = {
        name: `LightSensor(<${condition.lessThan})`,
        desc: `LightSensor(<${condition.lessThan})`,
        expression: `DATA()BETWEEN{${from},${condition.lessThan}}`,
        devices: [environment.deviceId],
        sensor: Constants.ID_ENVIRONMENT_RAY_RADIATION,
        enable: true,
        type: 'DATA',
        mode: 'SINGLE',
        actions: [
          {
            actionType: 'eventAction',
            name: `Set ${condition.brightness}%`,
            deviceEvent: {
              deviceId: lamp.deviceId,
              sensorId: Constants.ID_LAMP_SET_BRIGHTNESS_PERCENT,
              value: condition.brightness,
              type: 'rawdata',
            },
          },
        ],
      };
      data.push(expression);
      from = condition.lessThan;
    });

    const expression = {
      name: `LightSensor(>${from})`,
      desc: `LightSensor(>${from})`,
      expression: `DATA()>${from}`,
      devices: [environment.deviceId],
      sensor: Constants.ID_ENVIRONMENT_RAY_RADIATION,
      enable: true,
      type: 'DATA',
      mode: 'SINGLE',
      actions: [
        {
          actionType: 'eventAction',
          name: `Set 0%`,
          deviceEvent: {
            deviceId: lamp.deviceId,
            sensorId: Constants.ID_LAMP_SET_BRIGHTNESS_PERCENT,
            value: 0,
            type: 'rawdata',
          },
        },
      ],
    };
    data.push(expression);

    this.logger.log(
      `AddExpression: ${this.apiUrl}/expression\n${JSON.stringify(data)}`,
    );
    const response = await this.httpService
      .post(`${this.apiUrl}/expression`, data, options)
      .toPromise()
      .then((res: AxiosResponse<ExpressionResponse>) => res.data)
      .catch((error: AxiosError<IOTErrorData>) => {
        throw new ApolloError(
          `AddExpression in Environment(${environment.deviceId}) fail with error ${error.response?.data?.message}.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      });

    this.logger.debug(
      `Response from AddExpression: ${JSON.stringify(response)}`,
    );
    return response.expressionIds;
  }

  async deleteExpression(
    projectKey: string,
    expressionIds: string[],
  ): Promise<boolean> {
    return !!(await Promise.all(
      expressionIds.flatMap(async (expressionId) => {
        const options = {
          headers: {
            accept: 'application/json',
            CK: projectKey,
          },
        };

        this.logger.log(
          `DeleteExpression: ${this.apiUrl}/expression/${expressionId}`,
        );

        await this.httpService
          .delete(`${this.apiUrl}/expression/${expressionId}`, options)
          .toPromise()
          .catch((error: AxiosError<IOTErrorData>) => {
            this.logger.error(
              `Delete expression in the IOT failed with error = ${error.response?.data?.message}`,
            );
          });
      }),
    ));
  }

  async sensorValuesStatisticHistory(
    projectKey: string,
    deviceId: string,
    sensorId: string,
    start: Date,
    end: Date,
    interval: number,
    operation: ExtremeOperation,
  ): Promise<ISensorData[]> {
    const options = {
      headers: {
        accept: 'application/json',
        CK: projectKey,
      },
    };

    const params = {
      start: start.toISOString(),
      end: end.toISOString(),
      interval,
      raw: false,
    };
    const query = StringUtils.encodeQueryParameters(params);

    this.logger.log(
      `sensorValuesStatisticHistory: ${this.apiUrl}/device/${deviceId}/sensor/${sensorId}/rawdata/statistic?${query}`,
    );

    const response = await this.httpService
      .get(
        `${this.apiUrl}/device/${deviceId}/sensor/${sensorId}/rawdata/statistic?${query}`,
        options,
      )
      .toPromise()
      .then((res: AxiosResponse<SensorStatisticHistoryReponse>) => res.data)
      .catch((error: AxiosError<IOTErrorData>) => {
        this.logger.error(
          `get sensor statistic history from the IOT failed with error = ${error.response?.data?.message}`,
        );
        throw new ApolloError(
          `Get sensor statistic history from IOT with error: ${error.response?.data?.message}.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      });

    return response
      ? response.etl
          .filter((it) => {
            return it.count !== 0;
          })
          .map((it) => {
            const sensorData = new GaugeSensorData();
            const time = new Date(it.start);
            let value = 0;
            switch (operation) {
              case ExtremeOperation.AVG: {
                value = it.avg as number;
                break;
              }
              case ExtremeOperation.SUM: {
                value = it.sum;
                break;
              }
              case ExtremeOperation.COUNT: {
                value = it.count;
                break;
              }
            }
            sensorData.type = SensorType.GAUGE;
            sensorData.time = time;
            sensorData.value = value;
            return sensorData;
          })
      : [];
  }

  async sensorValuesRawHistory(
    projectKey: string,
    deviceId: string,
    sensorId: string,
    sensorType: SensorType,
    start: Date,
    end: Date,
  ): Promise<ISensorData[]> {
    const options = {
      headers: {
        accept: 'application/json',
        CK: projectKey,
      },
    };

    const params = {
      start: start.toISOString(),
      end: end.toISOString(),
    };
    const query = StringUtils.encodeQueryParameters(params);

    this.logger.log(
      `sensorValuesRawHistory: ${this.apiUrl}/device/${deviceId}/sensor/${sensorId}/rawdata?${query}`,
    );

    const response = await this.httpService
      .get(
        `${this.apiUrl}/device/${deviceId}/sensor/${sensorId}/rawdata?${query}`,
        options,
      )
      .toPromise()
      .then((res: AxiosResponse<SensorRawHistoryReponse[]>) => res.data)
      .catch((error: AxiosError<IOTErrorData>) => {
        this.logger.error(
          `get sensor history from the IOT failed with error = ${error.response?.data?.message}`,
        );
        throw new ApolloError(
          `Get sensor history from IOT with error: ${error.response?.data?.message}.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      });

    return response.map((it) => {
      return this.responseToISensorData(it, sensorType);
    });
  }

  async sensorValueRaw(
    projectKey: string,
    deviceId: string,
    sensorId: string,
    sensorType: SensorType,
  ): Promise<ISensorData> {
    const options = {
      headers: {
        accept: 'application/json',
        CK: projectKey,
      },
    };

    this.logger.log(
      `sensorValueRaw: ${this.apiUrl}/device/${deviceId}/sensor/${sensorId}/rawdata`,
    );

    const response = await this.httpService
      .get(
        `${this.apiUrl}/device/${deviceId}/sensor/${sensorId}/rawdata`,
        options,
      )
      .toPromise()
      .then((res: AxiosResponse<SensorRawHistoryReponse>) => res.data)
      .catch((error: AxiosError<IOTErrorData>) => {
        this.logger.error(
          `get sensor value from the IOT failed with error = ${error.response?.data?.message}`,
        );
        throw new ApolloError(
          `Get sensor value from IOT with error: ${error.response?.data?.message}.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      });

    return this.responseToISensorData(response, sensorType);
  }

  async createProject(name: string): Promise<string[]> {
    const options = {
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.aepKey,
      },
    };
    const data = {
      name,
      type: 'P400',
    };
    this.logger.log(
      `CreateProject: ${this.aepUrl}/project\n${JSON.stringify(data)}`,
    );

    const response = await this.httpService
      .post(`${this.aepUrl}/project`, data, options)
      .toPromise()
      .then((res: AxiosResponse<CreateProjectResponse>) => res.data)
      .catch((error: AxiosError<IOTErrorData>) => {
        this.logger.error(
          `Create project in the IOT failed with error = ${error.response?.data?.message}`,
        );
        throw new ApolloError(
          `Cannot create project - ${name} in the platform.`,
          ErrorCode.CHTIOT_API_ERROR,
        );
      });

    const projectId = response.id;
    const projectKey = response.projectKeys[0].key;
    return [projectId, projectKey];
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const options = {
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.aepKey,
      },
    };
    this.logger.log(`DeleteProject: ${this.aepUrl}/project/${projectId}`);

    const response = await this.httpService
      .delete(`${this.aepUrl}/project/${projectId}`, options)
      .toPromise()
      .then((res) => res.status)
      .catch((error: AxiosError<IOTErrorData>) => {
        this.logger.error(
          `Delete project in the IOT failed with error = ${error.response?.data?.message}`,
        );
      });

    return response === 200;
  }

  async editProjectName(projectId: string, name: string): Promise<boolean> {
    const options = {
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.aepKey,
      },
    };

    const data = {
      name,
      type: 'P400',
    };

    this.logger.log(
      `EditProjectName to ${name}: ${this.aepUrl}/project/${projectId}`,
    );

    const response = await this.httpService
      .put(`${this.aepUrl}/project/${projectId}`, data, options)
      .toPromise()
      .then((res) => res.status)
      .catch((error: AxiosError<IOTErrorData>) => {
        this.logger.error(
          `Edit project name in the IOT failed with error = ${error.response?.data?.message}`,
        );
      });

    return response === 200;
  }

  async updateLampSchedule(
    projectKey: string,
    deviceId: string,
    lightControls: LightControl[],
  ): Promise<boolean> {
    const options = {
      headers: {
        'Content-Type': 'application/json',
        CK: projectKey,
      },
    };

    // Add setSchedule sensor to the IOT device
    const acceptableBrightness = [100, 80, 60, 40, 20, 0];
    const payloads = acceptableBrightness.flatMap((brightness) => {
      const sensorId = this.getSensorIdFromBrightness(brightness);
      return {
        id: sensorId,
        name: `Schedule at ${brightness}%`,
        desc: `Set the schedule to control the brightness to ${brightness}%`,
        type: 'text',
      };
    });

    await Promise.all(
      payloads.flatMap(async (data) => {
        this.logger.log(
          `CreateSensor: ${
            this.apiUrl
          }/device/${deviceId}/sensor\n${JSON.stringify(data)}`,
        );
        this.httpService
          .post(`${this.apiUrl}/device/${deviceId}/sensor`, data, options)
          .toPromise()
          .catch((error: AxiosError<IOTErrorData>) => {
            this.logger.error(
              `Create sensor with query with error = ${error.response?.data?.message}`,
            );
            throw new ApolloError(
              `Create sensor ${deviceId} (${data.id}) fail with error ${error.response?.data?.message}.`,
              ErrorCode.CHTIOT_API_ERROR,
            );
          });
      }),
    );

    // update setSchedule sensor value for the IOT device
    return !!(await Promise.all(
      acceptableBrightness.flatMap(async (brightness) => {
        const sensorId = this.getSensorIdFromBrightness(brightness);
        const lightControl = lightControls.filter(
          (it) => it.brightness === brightness,
        )[0];
        let value = '-1';
        if (lightControl !== undefined) {
          value = `${StringUtils.zeroPad(
            lightControl.hour,
            2,
          )}${StringUtils.zeroPad(lightControl.minute, 2)}`;
        }
        await this.updateSensor(projectKey, deviceId, sensorId, value);
      }),
    ));
  }

  async updateDeltaLampSchedule(
    projectKey: string,
    deviceId: string,
    lightControls: LightControl[],
  ): Promise<boolean> {
    // update setSchedule sensor value for the IOT device
    return !!(await Promise.all(
      lightControls.flatMap(async (lightControl, index) => {
        const sensorId = `setSchedule${index + 1}`;
        let value = '-1';
        if (lightControl !== undefined) {
          value = `${StringUtils.zeroPad(
            lightControl.hour,
            2,
          )}${StringUtils.zeroPad(lightControl.minute, 2)}${StringUtils.zeroPad(
            lightControl.brightness,
            3,
          )}`;
        }
        await this.updateSensor(projectKey, deviceId, sensorId, value);
      }),
    ));
  }

  private convertToDevices(response: DeviceReponse[]): Device[] {
    return response.flatMap((deviceResponse) => {
      const device = new Device();
      device.deviceId = deviceResponse.id;
      device.name = deviceResponse.name;
      device.desc = deviceResponse.desc;
      device.uri = deviceResponse.uri;
      device.status = DeviceStatus.ACTIVE;
      device.type = DeviceType.UNKNOWN;

      if (deviceResponse.lon && deviceResponse.lat) {
        const location = new GeoJSON();
        const coordinates = [deviceResponse.lon, deviceResponse.lat];
        location.coordinates = coordinates;
        // ignore the invalid coordinates
        if (location.isValidCoordinates()) {
          device.location = location;
        }
      }

      if (deviceResponse.attributes) {
        device.attributes = deviceResponse.attributes.flatMap((attribute) => {
          const attr = new Attribute();
          attr.key = attribute.key;
          attr.value = attribute.value;
          if (attr.key === Constants.KEY_ATTR_DEVICE_TYPE) {
            device.type = StringUtils.deviceTypeFrom(attr.value);
          }
          return attr;
        });
      }

      return device;
    });
  }

  private convertToSensors(response: SensorReponse[]): Sensor[] {
    return response.flatMap((sensorResponse) => {
      const sensor = new Sensor();
      sensor.sensorId = sensorResponse.id;
      sensor.name = sensorResponse.name;
      sensor.desc = sensorResponse.desc;

      switch (sensorResponse.type.toUpperCase()) {
        case SensorType.GAUGE: {
          sensor.type = SensorType.GAUGE;
          break;
        }
        case SensorType.TEXT: {
          sensor.type = SensorType.TEXT;
          break;
        }
        case SensorType.SNAPSHOT: {
          sensor.type = SensorType.SNAPSHOT;
          break;
        }
        case SensorType.SWITCH: {
          sensor.type = SensorType.SWITCH;
          break;
        }
        default: {
          this.logger.error(
            `Cannot find the sensorType for ${sensorResponse.type}`,
          );
          break;
        }
      }

      sensor.unit = sensorResponse.unit;
      if (sensorResponse.attributes) {
        sensor.attributes = sensorResponse.attributes.flatMap((attribute) => {
          const attr = new Attribute();
          attr.key = attribute.key;
          attr.value = attribute.value;
          /**
           * For those who sensor from IOT used the different sensorId, using
           * attribute to change its sensorId to meets the sensorId used in
           * the CityOS.
           */
          if (attr.key === Constants.VALUE_ATTR_SENSOR_ID_CITYOS) {
            sensor.sensorId = attr.value;
            sensor._iotSensorId = sensorResponse.id;
          }
          return attr;
        });
      }
      return sensor;
    });
  }

  private getSensorIdFromBrightness(brightness: number): string {
    switch (brightness) {
      case 100:
        return Constants.ID_SCHEDULE_AT_BRIGHTNESS_100_PERCENT;
      case 80:
        return Constants.ID_SCHEDULE_AT_BRIGHTNESS_80_PERCENT;
      case 60:
        return Constants.ID_SCHEDULE_AT_BRIGHTNESS_60_PERCENT;
      case 40:
        return Constants.ID_SCHEDULE_AT_BRIGHTNESS_40_PERCENT;
      case 20:
        return Constants.ID_SCHEDULE_AT_BRIGHTNESS_20_PERCENT;
      case 0:
        return Constants.ID_SCHEDULE_AT_BRIGHTNESS_0_PERCENT;
      default:
        throw new ApolloError(
          `Cannot find the sensorId for brightness ${brightness} in getSensorIdFromBrightness`,
        );
    }
  }

  private responseToISensorData(
    response: SensorRawHistoryReponse,
    sensorType: SensorType,
  ): ISensorData {
    const time = new Date(response.time);
    const value = response.value[0];
    switch (sensorType) {
      case SensorType.GAUGE: {
        const gaugeSensorData = new GaugeSensorData();
        gaugeSensorData.type = SensorType.GAUGE;
        gaugeSensorData.time = time;
        gaugeSensorData.value = +value;
        return gaugeSensorData;
      }
      case SensorType.SNAPSHOT: {
        const snapshotSensorData = new SnapshotSensorData();
        snapshotSensorData.type = SensorType.SNAPSHOT;
        snapshotSensorData.time = time;
        const snapshotId = value.replace('snapshot://', ''); // value[0] should be 'snapshot://f4fe4b4b-8c2c-4149-865f-02847ca21b2e'
        snapshotSensorData.value = `${this.configService.get<string>(
          'CHTIOT_SERVER_URI',
        )}/device/${response.deviceId}/sensor/${
          response.id
        }/snapshot/${snapshotId}`;
        return snapshotSensorData;
      }
      case SensorType.TEXT: {
        const textSensorData = new TextSensorData();
        textSensorData.type = SensorType.TEXT;
        textSensorData.time = time;
        textSensorData.value = value;
        return textSensorData;
      }
      case SensorType.SWITCH: {
        const switchSensorData = new SwitchSensorData();
        switchSensorData.type = SensorType.SWITCH;
        switchSensorData.time = time;
        switchSensorData.value = parseFloat(value) > 0;
        return switchSensorData;
      }
    }
  }
}
