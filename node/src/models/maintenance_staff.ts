import { Document, Types } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Maintenance_devicelist as ApolloMaintenanceStaff } from 'src/graphql.schema';
import { Device } from './device';

// @ObjectType()
// export class Timezone {
//   @Field()
//   @prop()
//   rawOffset: number;

//   @Field()
//   @prop()
//   timeZoneId: string;

//   @Field()
//   @prop()
//   timeZoneName: string;
// }
const toApolloMaintenanceStaff = function (
  this: MaintenanceStaff,
): ApolloMaintenanceStaff {
  const apolloMaintenanceStaff = new ApolloMaintenanceStaff();
  //apolloMaintenance_staff.device = this.device[0];
  apolloMaintenanceStaff.userId = this.userId;
  apolloMaintenanceStaff.id = this._id.toString();

  //apolloDevice.timezone = this.timezone;

  return apolloMaintenanceStaff;
};
@Schema()
//@index({ location: '2dsphere' })
export class MaintenanceStaff {
  _id!: Types.ObjectId;

  id: string;

  @Prop({ ref: () => Device })
  device: Device[];

  @Prop()
  userId: string;

  toApolloMaintenanceStaff: () => ApolloMaintenanceStaff =
    toApolloMaintenanceStaff;
  // @prop()
  // @Field()
  // UserId: string;

  // @prop()
  // @Field()
  // UserId: string;

  // @prop({ _id: false })
  // @Field()
  // timezone: Timezone;
}
export type MaintenanceStaffDocument = MaintenanceStaff & Document;
export const MaintenanceStaffSchema =
  SchemaFactory.createForClass(MaintenanceStaff);
