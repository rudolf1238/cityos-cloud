export class ActiveSetting {
  constructor(
    // using '5m' for 5 minutes, '1h' for 1 hour, '1d' for 1 day or '1h 30m' for 90 minutes
    period: string,
    // minimum sensor values changed in the period
    minUploads: number,
    // maximum sensor values changed in the period
    maxUploads: number,
  ) {
    this.period = period;
    this.minUploads = minUploads;
    this.maxUploads = maxUploads;
  }

  period: string;

  minUploads: number;

  maxUploads: number;
}
