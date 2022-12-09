import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { DeviceType, SensorType } from 'src/graphql.schema';

@Schema()
export class ElasticSearchSensor {
  _id: Types.ObjectId;

  id: string;

  @Prop()
  deviceType: DeviceType;

  @Prop()
  sensorId: string;

  @Prop()
  sensorName: string;

  @Prop()
  sensorType: SensorType;

  @Prop()
  from?: Date;

  @Prop()
  to?: Date;

  @Prop()
  enable: boolean;

  @Prop({ type: Number, default: 100 })
  status = 100;
}

export type ElasticSearchSensorDocument = ElasticSearchSensor & Document;
export const ElasticSearchSensorSchema =
  SchemaFactory.createForClass(ElasticSearchSensor);
