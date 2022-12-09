import { ActiveSetting } from 'src/models/active.setting';
import { DeviceType } from 'src/graphql.schema';

export default class ActiveSettingUtils {
  static settingFromType(type: DeviceType): ActiveSetting {
    switch (type) {
      case DeviceType.LAMP: {
        return new ActiveSetting('10m', 5, 99);
      }
      case DeviceType.SOLAR: {
        return new ActiveSetting('10m', 4, 99);
      }
      case DeviceType.CHARGING: {
        return new ActiveSetting('10m', 3, 99);
      }
      case DeviceType.CAMERA: {
        return new ActiveSetting('10m', 2, 99);
      }
      case DeviceType.WATER: {
        return new ActiveSetting('10m', 1, 99);
      }
      case DeviceType.ENVIRONMENT: {
        return new ActiveSetting('10m', 6, 99);
      }
      case DeviceType.WIFI: {
        return new ActiveSetting('10m', 7, 99);
      }
      case DeviceType.DISPLAY: {
        return new ActiveSetting('10m', 8, 99);
      }
      default: {
        return new ActiveSetting('10m', 9, 99);
      }
    }
  }
}
