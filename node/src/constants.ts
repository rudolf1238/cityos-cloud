export class Constants {
  // define for the key of device's attrbutes
  static readonly KEY_ATTR_DEVICE_TYPE = 'device_type';

  static readonly KEY_ATTR_RECOGNITION_TYPE = 'recognition_type';

  static readonly KEY_ATTR_ATTACH_ON = 'attach_on';

  static readonly KEY_ATTR_CAMERA_ID = 'camid';

  static readonly VALUE_ATTR_LAMP = 'streetlight';

  static readonly VALUE_ATTR_SOLAR = 'solar';

  static readonly VALUE_ATTR_CHARGING = 'charging_pile';

  static readonly VALUE_ATTR_CAMERA = 'cctv';

  static readonly VALUE_ATTR_BUILDING = 'building';

  static readonly VALUE_ATTR_WATER = 'waterlevel';

  static readonly VALUE_ATTR_ENVIRONMENT = 'meter';

  static readonly VALUE_ATTR_WIFI = 'wifi_ap';

  static readonly VALUE_ATTR_DISPLAY = 'digital_signage';

  static readonly VALUE_ATTR_HUMAN_FLOW = 'human_flow';

  static readonly VALUE_ATTR_HUMAN_FLOW_ADVANCE = 'human_flow_advance';

  static readonly VALUE_ATTR_HUMAN_SHAPE = 'human_shape';

  static readonly VALUE_ATTR_CAR_IDENTIFY = 'car_identify';

  static readonly VALUE_ATTR_CAR_FLOW = 'car_flow';

  // define for the key of sensor's attrbutes
  static readonly VALUE_ATTR_SENSOR_ID_CITYOS = 'sensor_id_cityos';
  
  static readonly VALUE_ATTR_INDOOR_LAMP = 'indoor_lamp';

  static readonly VALUE_ATTR_CHILLER = 'chiller';

  static readonly SPEAKER = 'speaker';

  static readonly VALUE_ATTR_FIRE_ALARM = 'fire_alarm';

  static readonly VALUE_ATTR_POWER_METER = 'power_meter';

  static readonly VALUE_ATTR_ELEVATOR = 'elevator';

  static readonly VALUE_ATTR_BANPU_INDOOR_METER = 'banpu_indoor_meter';

  static readonly VALUE_ATTR_OPEN_DATA_WEATHER = 'opendata_meter';

  static readonly VALUE_ATTR_USAGE_METER = 'usage_meter';

  // define for the device's sensorId
  static readonly ID_SCHEDULE_AT_BRIGHTNESS_100_PERCENT = 'setSchedule1';

  static readonly ID_SCHEDULE_AT_BRIGHTNESS_80_PERCENT = 'setSchedule2';

  static readonly ID_SCHEDULE_AT_BRIGHTNESS_60_PERCENT = 'setSchedule3';

  static readonly ID_SCHEDULE_AT_BRIGHTNESS_40_PERCENT = 'setSchedule4';

  static readonly ID_SCHEDULE_AT_BRIGHTNESS_20_PERCENT = 'setSchedule5';

  static readonly ID_SCHEDULE_AT_BRIGHTNESS_0_PERCENT = 'setSchedule6';

  static readonly ID_ENVIRONMENT_RAY_RADIATION = 'ray_radiation';

  static readonly ID_LAMP_SET_BRIGHTNESS_PERCENT = 'setBrightnessPercent';

  static readonly ID_CAMERA_PEDESTRIAN = 'pedestrian';

  static readonly ID_CAMERA_CLOTHESCOLOR = 'clothesColor';

  static readonly ID_CAMERA_GENDER = 'gender';

  static readonly ID_CAMERA_VEHICLE = 'vehicle';

  static readonly ID_CAMERA_NUMBERPLATE = 'numberPlate';

  static readonly ID_CAMERA_VEHICLETYPE = 'vehicleType';

  static readonly ID_CAMERA_VEHICLECOLOR = 'vehicleColor';

  static readonly ID_CAMERA_HUMAN_FLOW_SEX = 'human_flow_sex';

  static readonly ID_CAMERA_HUMAN_FLOW_AGE = 'human_flow_age';

  static readonly ID_CAMERA_HUMAN_FLOW_IMAGE = 'human_flow_image';

  static readonly ID_CAMERA_CAR_FLOW_STRAIGHT_COUNT = 'car_flow_straight_count';

  static readonly ID_CAMERA_CAR_FLOW_STRAIGHT_IMAGE = 'car_flow_straight_image';

  static readonly ID_CAMERA_HUMAN_COUNT = 'human_count';

  static readonly ID_CAMERA_HUMAN_IMAGE = 'human_image';

  // define for the constraint for the service
  static readonly DEEPEST_LEVEL_FOR_GROUPS = 6;

  static readonly CHT_CAMERA_EXTEND_IN_MINUTES = 20;

  static readonly CHT_CAMERA_PLAYBACK_EXPIRED_IN_HOURS = 4;

  static readonly MAXIMUM_RETRY_PASSWORD = 3;

  static readonly MAXIMUM_RETRY_PASSWORD_SESSION_IN_MINUTES = 30;

  static readonly MAXIMUM_NUMBER_FOR_ROLE_TEMPLATES = 20;

  static readonly HOURS_TO_CHECK_DEVICE_STATUS = 12;

  static readonly CHECK_AUTOMATION_IF_DATA_IN_SECONDS = 60;

  // define for the common name for the service
  static readonly PREFIX_FOR_VERIFY_STATUS_TOPIC = 'deviceToken/';

  static readonly PREFIX_FOR_DEVICE_STATUS_TOPIC = 'deviceStatus/';

  static readonly PREFIX_FOR_EXTREME_VALUE_TOPIC = 'extremeValue/';

  static readonly PREFIX_FOR_SENSOR_VALUE_STATS_TOPIC = 'sensorValueStats/';

  static readonly PREFIX_FOR_PROPER_RATE_TOPIC = 'properRate/';

  static readonly PREFIX_FOR_ES_PROCESSING_TOPIC = 'esProcessing/';

  static readonly KEY_CHECK_PERMISSIONS = 'check_permissions';

  // define for the system specific redis topic name
  static readonly DEVICE_STATUS_FOR_STSTEM_TOPIC = 'system/deviceStatus';

  static readonly SENSOR_VALUES_FOR_STSTEM_TOPIC = 'system/sensorValues';

  // define for the index name for the elasticsearch
  static readonly INDEX_FOR_DEVICE_STATUS = 'device.status';

  static readonly INDEX_FOR_HOURLY_DEVICE_STATUS = 'device.status.hourly';

  static readonly INDEX_SUFFIX_FOR_CAMERA_EVENTS = 'events';

  // define for the name for the background task (Bull Module)
  static readonly BULL_TASK_SYNC_ELASTICSEARCH = 'sync.elasticsearch';

  static readonly BULL_TASK_INIT_ES_RESPONSE = 'init.es.response';

  static readonly BULL_TASK_PROCESS_RULE = 'process.rule';
}
