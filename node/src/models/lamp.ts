import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Device } from './device';

@Schema()
export class LightSensorCondition {
  @Prop()
  lessThan: number;

  @Prop()
  brightness: number;
}

export const LightSensorConditionSchema =
  SchemaFactory.createForClass(LightSensorCondition);

@Schema()
export class LightControl {
  @Prop()
  hour: number;

  @Prop()
  minute: number;

  @Prop()
  brightness: number;
}

export const LightControlSchema = SchemaFactory.createForClass(LightControl);

@Schema()
export class Schedule {
  @Prop()
  startMonth: number;

  @Prop()
  startDay: number;

  @Prop({ type: [LightControlSchema], _id: false })
  lightControls: LightControl[];
}

export const ScheduleSchema = SchemaFactory.createForClass(Schedule);

@Schema()
export class LightSensor {
  @Prop()
  enableLightSensor: boolean;

  @Prop({ type: [LightSensorConditionSchema], _id: false })
  lightSensorCondition?: LightSensorCondition[];

  @Prop({ type: [String] })
  expressionIds?: string[]; // the rule ids like IFTTT defined on the CHT IOT platform
}

export const LightSensorSchema = SchemaFactory.createForClass(LightSensor);

@Schema()
export class ManualSchedule {
  @Prop()
  enableManualSchedule?: boolean;

  @Prop({ type: [ScheduleSchema], _id: false })
  schedules?: Schedule[];
}

export const ManualScheduleSchema =
  SchemaFactory.createForClass(ManualSchedule);

@Schema()
export class LightSchedule {
  @Prop({ type: LightSensorSchema, _id: false })
  lightSensor?: LightSensor;

  @Prop({ type: ManualScheduleSchema, _id: false })
  manualSchedule?: ManualSchedule;
}

export const LightScheduleSchema = SchemaFactory.createForClass(LightSchedule);

@Schema()
export class Lamp extends Device {
  @Prop({ type: LightScheduleSchema, _id: false })
  lightSchedule: LightSchedule;
}

export type LampDocument = Lamp & Document;
export const LampSchema = SchemaFactory.createForClass(Lamp);
