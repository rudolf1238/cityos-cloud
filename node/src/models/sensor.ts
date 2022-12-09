import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { DeviceType, SensorType } from 'src/graphql.schema';

@Schema()
export class Attribute {
  @Prop()
  key: string;

  @Prop()
  value: string;
}

export const AttributeSchema = SchemaFactory.createForClass(Attribute);

@Schema()
export class Sensor {
  _id: Types.ObjectId;

  id: string;

  @Prop()
  sensorId: string;

  @Prop({ required: false })
  _iotSensorId?: string;

  iotSensorId: string;

  @Prop()
  name: string;

  @Prop()
  desc?: string;

  @Prop()
  type: SensorType;

  @Prop()
  deviceType?: DeviceType;

  @Prop()
  unit?: string;

  @Prop({ type: [AttributeSchema], _id: false })
  attributes: Attribute[] = [];
}

export type SensorDocument = Sensor & Document;
export const SensorSchema = SchemaFactory.createForClass(Sensor);
SensorSchema.virtual('iotSensorId').get(function (this: SensorDocument) {
  return this._iotSensorId || this.sensorId;
});
