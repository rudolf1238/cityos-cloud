export interface ESCameraEvent {
  deviceId: string;
  time: number;
  type: string;
  // human_shape
  pedestrian?: string;
  clothesColor?: string;
  gender?: string;
  // car_identify
  vehicle?: string;
  numberPlate?: string;
  vehicleType?: string;
  vehicleColor?: string;
  // human_flow_advance
  human_flow_sex?: string;
  human_flow_age?: number;
  human_flow_image?: string;
}
