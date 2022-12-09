import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Constants } from 'src/constants';
import {
  DeviceType,
  Device as ApolloDevice,
  Building as ApolloBuilding,
  Floor as ApolloFloor,
  Lamp as ApolloLamp,
  GPSPoint,
  DeviceStatus,
  MaintainStatus,
  RecognitionType,
} from 'src/graphql.schema';
import { Group, DisabledGroup } from './group';
import { Lamp } from './lamp';
import { Sensor } from './sensor';

@Schema()
export class AddressDetail {
  @Prop()
  country: string;

  @Prop()
  city: string;

  @Prop()
  formattedAddress: string;
}

export const AddressDetailSchema = SchemaFactory.createForClass(AddressDetail);

@Schema()
export class Address {
  @Prop()
  language: string;

  @Prop({ type: AddressDetailSchema, _id: false })
  detail: AddressDetail;
}

export const AddressSchema = SchemaFactory.createForClass(Address);

@Schema()
export class Timezone {
  @Prop()
  rawOffset: number;

  @Prop()
  timeZoneId: string;

  @Prop()
  timeZoneName: string;
}

export const TimezoneSchema = SchemaFactory.createForClass(Timezone);

@Schema()
export class Attribute {
  @Prop()
  key: string;

  @Prop()
  value: string;

  push: any;
}

export const AttributeSchema = SchemaFactory.createForClass(Attribute);

@Schema()
export class GeoJSON {
  @Prop({ type: String })
  type = 'Point';

  @Prop({ type: [Number] })
  coordinates: number[]; // specify coordinates in order of longitude, latitude

  isValidCoordinates(): boolean {
    if (this.coordinates.length === 2) {
      if (this.coordinates[0] < -180 || this.coordinates[0] > 180) {
        return false;
      }

      if (this.coordinates[1] < -90 || this.coordinates[1] > 90) {
        return false;
      }

      return true;
    }
    return false;
  }
}

export const GeoJSONSchema = SchemaFactory.createForClass(GeoJSON);

const toApolloDevice = function (this: Device): ApolloDevice {
  const apolloDevice = new ApolloDevice();
  apolloDevice.id = this.id;
  apolloDevice.deviceId = this.deviceId;
  apolloDevice.name = this.name;
  apolloDevice.desc = this.desc;
  apolloDevice.uri = this.uri;
  apolloDevice.type = this.type;
  if (this.location) {
    const gpsPoint = new GPSPoint();
    [gpsPoint.lat, gpsPoint.lng] = [
      this.location.coordinates[1],
      this.location.coordinates[0],
    ];
    apolloDevice.location = gpsPoint;
  }
  if (this.groups) {
    apolloDevice.groups = this.groups.flatMap((it) => {
      return it.toApolloGroup();
    });
  }
  apolloDevice.sensors = this.sensors;
  apolloDevice.maintainstatus = this.maintainstatus;
  apolloDevice.status = this.status;
  apolloDevice.attributes = this.attributes;
  apolloDevice.timezone = this.timezone;
  apolloDevice.imageIds = this.imageIds;

  switch (this.type) {
    case DeviceType.LAMP: {
      const apolloLamp = apolloDevice as ApolloLamp;
      apolloLamp.lightSchedule = (this as unknown as Lamp).lightSchedule;
      return apolloLamp;
    }
    default:
      return apolloDevice;
  }
};

const getSensor = function (
  this: Device,
  sensorId: string,
): Sensor | undefined {
  return this.sensors.find((it) => it.sensorId === sensorId);
};

@Schema({ timestamps: true })
export class Device {
  _id: Types.ObjectId;

  id: string;

  @Prop()
  deviceId: string;

  @Prop()
  name: string;

  @Prop()
  desc?: string;

  @Prop()
  uri: string;

  @Prop()
  type: DeviceType;

  @Prop({ type: GeoJSONSchema, index: '2dsphere', _id: false })
  location?: GeoJSON;

  @Prop({ type: [Types.ObjectId], ref: Sensor.name, autopopulate: true })
  sensors: Sensor[] = [];

  @Prop({ type: [Types.ObjectId], ref: Group.name, autopopulate: true })
  groups: Group[];

  @Prop()
  status?: DeviceStatus;

  @Prop({ type: [AttributeSchema], _id: false })
  attributes: Attribute[] = [];

  @Prop({ type: TimezoneSchema, _id: false })
  timezone: Timezone;

  @Prop({ type: [AddressSchema], _id: false })
  address: Address[] = [];

  @Prop({ _id: false })
  disabledGroups: DisabledGroup[];

  @Prop()
  relatedStatus?: DeviceStatus;

  @Prop()
  maintainstatus?: MaintainStatus;

  @Prop()
  imageIds?: string[];

  @Prop()
  usedForBuilding?: boolean;

  @Prop()
  eSignagePlayerName?: string;

  toApolloDevice: () => ApolloDevice = toApolloDevice;

  recognitionType: () => RecognitionType;

  getSensor: (sensorId: string) => Sensor | undefined = getSensor;
}

export type DeviceDocument = Device & Document;
export const DeviceSchema = SchemaFactory.createForClass(Device);

DeviceSchema.methods.toApolloDevice = toApolloDevice;

DeviceSchema.methods.recognitionType = function (
  this: Device,
): RecognitionType {
  if (this.type !== DeviceType.CAMERA) {
    return null;
  } else {
    const recognitionTypeString = this.attributes.find(
      (it) => it.key === Constants.KEY_ATTR_RECOGNITION_TYPE,
    )?.value;

    switch (recognitionTypeString) {
      case Constants.VALUE_ATTR_HUMAN_SHAPE: {
        return RecognitionType.HUMAN_SHAPE;
      }
      case Constants.VALUE_ATTR_CAR_IDENTIFY: {
        return RecognitionType.CAR_IDENTIFY;
      }
      case Constants.VALUE_ATTR_HUMAN_FLOW: {
        return RecognitionType.HUMAN_FLOW;
      }
      case Constants.VALUE_ATTR_HUMAN_FLOW_ADVANCE: {
        return RecognitionType.HUMAN_FLOW_ADVANCE;
      }
      case Constants.VALUE_ATTR_CAR_FLOW: {
        return RecognitionType.CAR_FLOW;
      }
      default: {
        return null;
      }
    }
  }
};

DeviceSchema.methods.getSensor = getSensor;

@Schema({ timestamps: true })
export class Floor {
  // _id: Types.ObjectId;

  @Prop({ type: String })
  id: string;

  @Prop({ type: String })
  name: string;

  @Prop({ type: [Types.ObjectId], ref: Device.name, autopopulate: true })
  devices: Device[];

  @Prop({ type: String })
  floorNum: string;

  @Prop({ type: [String] })
  imageLeftTop: string[] = [];

  @Prop({ type: [String] })
  imageRightBottom: string[] = [];
}
export const FloorSchema = SchemaFactory.createForClass(Floor);
export type FloorDocument = Floor & Document;

const toApolloBuilding = function (this: Building): ApolloBuilding {
  const apolloBuilding = new ApolloBuilding();
  apolloBuilding.deviceId = this.deviceId;
  apolloBuilding.name = this.name;
  apolloBuilding.desc = this.desc;
  apolloBuilding.uri = this.uri;
  apolloBuilding.type = this.type;
  if (this.location) {
    const gpsPoint = new GPSPoint();
    [gpsPoint.lat, gpsPoint.lng] = [
      this.location.coordinates[1],
      this.location.coordinates[0],
    ];
    apolloBuilding.location = gpsPoint;
  }
  if (this.groups) {
    apolloBuilding.groups = this.groups.flatMap((it) => {
      return it.toApolloGroup();
    });
  }
  apolloBuilding.sensors = this.sensors;
  apolloBuilding.status = this.status;
  apolloBuilding.maintainstatus = this.maintainstatus;
  apolloBuilding.attributes = this.attributes;
  apolloBuilding.timezone = this.timezone;

  apolloBuilding.address = this.address;
  if (this.floors) {
    apolloBuilding.floors = this.floors.flatMap((it) => {
      const apolloFloor = new ApolloFloor();
      apolloFloor.id = it.id;
      apolloFloor.name = it.name;
      if (it.devices) {
        apolloFloor.devices = it.devices.flatMap((i) => {
          return i.toApolloDevice();
        });
      }
      apolloFloor.floorNum = it.floorNum;
      apolloFloor.imageLeftTop = it.imageLeftTop.flatMap((i) => i.toString());
      apolloFloor.imageRightBottom = it.imageRightBottom.flatMap((i) =>
        i.toString(),
      );
      return apolloFloor;
    });
  }

  apolloBuilding.imageIds = this.imageIds;
  return apolloBuilding;
};

@Schema({ timestamps: true })
export class Building extends Device {
  _id: Types.ObjectId;

  id: string;

  @Prop({ type: [FloorSchema], _id: false })
  floors: Floor[] = [];

  toApolloBuilding: () => ApolloBuilding = toApolloBuilding;

  recognitionType: () => RecognitionType;

  sensorUnit: (sensorId: string) => string;
}
export const BuildingSchema = SchemaFactory.createForClass(Building);
export type BuildingDocument = Building & Document;

BuildingSchema.methods.toApolloBuilding = toApolloBuilding;
