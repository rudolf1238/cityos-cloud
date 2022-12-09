/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Base64Encode } from 'base64-stream';
import { Stream } from 'form-data';
import { Constants } from 'src/constants';
import { DeviceStatus, DeviceType, Language } from 'src/graphql.schema';
import concat from 'concat-stream';

export default class StringUtils {
  static keysToLowerCase(input: any): any {
    return Object.keys(input).reduce((destination, key) => {
      destination[key.toLowerCase()] = input[key];
      return destination;
    }, {});
  }

  static zeroPad = (num: number, places: number) =>
    String(num).padStart(places, '0');

  static deviceTypeFrom(str: string): DeviceType {
    switch (str) {
      case Constants.VALUE_ATTR_LAMP: {
        return DeviceType.LAMP;
      }
      case Constants.VALUE_ATTR_SOLAR: {
        return DeviceType.SOLAR;
      }
      case Constants.VALUE_ATTR_CHARGING: {
        return DeviceType.CHARGING;
      }
      case Constants.VALUE_ATTR_CAMERA: {
        return DeviceType.CAMERA;
      }
      case Constants.VALUE_ATTR_WATER: {
        return DeviceType.WATER;
      }
      case Constants.VALUE_ATTR_ENVIRONMENT: {
        return DeviceType.ENVIRONMENT;
      }
      case Constants.VALUE_ATTR_WIFI: {
        return DeviceType.WIFI;
      }
      case Constants.VALUE_ATTR_DISPLAY: {
        return DeviceType.DISPLAY;
      }
      case Constants.VALUE_ATTR_BUILDING: {
        return DeviceType.BUILDING;
      }
      case Constants.VALUE_ATTR_INDOOR_LAMP: {
        return DeviceType.INDOOR_LAMP;
      }
      case Constants.VALUE_ATTR_CHILLER: {
        return DeviceType.CHILLER;
      }
      case Constants.SPEAKER: {
        return DeviceType.SPEAKER;
      }
      case Constants.VALUE_ATTR_FIRE_ALARM: {
        return DeviceType.FIRE_ALARM;
      }
      case Constants.VALUE_ATTR_POWER_METER: {
        return DeviceType.POWER_METER;
      }
      case Constants.VALUE_ATTR_ELEVATOR: {
        return DeviceType.ELEVATOR;
      }
      case Constants.VALUE_ATTR_BANPU_INDOOR_METER: {
        return DeviceType.BANPU_INDOOR_METER;
      }
      case Constants.VALUE_ATTR_OPEN_DATA_WEATHER: {
        return DeviceType.OPEN_DATA_WEATHER;
      }
      case Constants.VALUE_ATTR_USAGE_METER: {
        return DeviceType.USAGE_METER;
      }
      default: {
        return DeviceType.UNKNOWN;
      }
    }
  }

  static stringFromType(type: DeviceType): string {
    switch (type) {
      case DeviceType.LAMP: {
        return Constants.VALUE_ATTR_LAMP;
      }
      case DeviceType.SOLAR: {
        return Constants.VALUE_ATTR_SOLAR;
      }
      case DeviceType.CHARGING: {
        return Constants.VALUE_ATTR_CHARGING;
      }
      case DeviceType.CAMERA: {
        return Constants.VALUE_ATTR_CAMERA;
      }
      case DeviceType.WATER: {
        return Constants.VALUE_ATTR_WATER;
      }
      case DeviceType.ENVIRONMENT: {
        return Constants.VALUE_ATTR_ENVIRONMENT;
      }
      case DeviceType.WIFI: {
        return Constants.VALUE_ATTR_WIFI;
      }
      case DeviceType.DISPLAY: {
        return Constants.VALUE_ATTR_DISPLAY;
      }
      case DeviceType.BUILDING: {
        return Constants.VALUE_ATTR_BUILDING;
      }
      case DeviceType.ELEVATOR: {
        return Constants.VALUE_ATTR_ELEVATOR;
      }
      case DeviceType.INDOOR_LAMP: {
        return Constants.VALUE_ATTR_INDOOR_LAMP;
      }
      case DeviceType.CHILLER: {
        return Constants.VALUE_ATTR_CHILLER;
      }
      case DeviceType.SPEAKER: {
        return Constants.SPEAKER;
      }
      case DeviceType.FIRE_ALARM: {
        return Constants.VALUE_ATTR_FIRE_ALARM;
      }
      case DeviceType.POWER_METER: {
        return Constants.VALUE_ATTR_POWER_METER;
      }
      case DeviceType.BANPU_INDOOR_METER: {
        return Constants.VALUE_ATTR_BANPU_INDOOR_METER;
      }
      case DeviceType.OPEN_DATA_WEATHER: {
        return Constants.VALUE_ATTR_OPEN_DATA_WEATHER;
      }
      case DeviceType.USAGE_METER: {
        return Constants.VALUE_ATTR_USAGE_METER;
      }
      default: {
        return '';
      }
    }
  }

  static deviceStatusFrom(str: string): DeviceStatus {
    return str === 'start' || str === 'online'
      ? DeviceStatus.ACTIVE
      : DeviceStatus.ERROR;
  }

  static nl2space(input: string): string {
    return input.replace(/\r?\n/g, ' ');
  }

  static nl2br(input: string): string {
    return input.replace(/\r?\n/g, '<br />');
  }

  static escapeRegExp(text: string): string {
    return text?.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  }

  static isValidPassword(password: string): boolean {
    if (password.length < 8 || password.length > 200) {
      return false;
    }
    return true;
  }

  static dateToTimestampMilli(date: Date): number {
    return date.getTime();
  }

  static encodeQueryParameters(params: any): string {
    const esc = encodeURIComponent;
    return Object.keys(params)
      .map((k) => `${esc(k)}=${esc(params[k] as string)}`)
      .join('&');
  }

  static removeStringAfter(
    data: string,
    removeString: string,
    keepSelf: boolean,
  ): string {
    const index = data.lastIndexOf(removeString);
    return index !== -1
      ? data.substring(0, keepSelf ? index + 1 : index)
      : data;
  }

  static async streamToBase64(stream: Stream): Promise<string> {
    return new Promise((resolve, reject) => {
      const cbConcat = (base64) => {
        resolve(base64);
      };

      stream
        .pipe(new Base64Encode())
        .pipe(concat(cbConcat))
        .on('error', (error) => {
          reject(error);
        });
    });
  }

  static convertToI18nFormat(language: Language): string {
    const fallbackLng = language
      .split('-')
      .reduce<string[]>((list, part, i) => {
        list.unshift(`${list[0] || ''}${i > 0 ? '-' : ''}${part}`);
        return list;
      }, []);
    for (let i = 0; i < fallbackLng.length; i += 1) {
      if (Language.zh_Hant_TW.startsWith(fallbackLng[i])) {
        return 'zh-Hant-TW';
      }
      if (Language.en_US.startsWith(fallbackLng[i])) {
        return 'en-US';
      }
    }
    return fallbackLng[0];
  }
}
