import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { DateTime } from 'luxon';
import mongoose from 'mongoose';
import { UpdateSensorsDto } from './app.controller';
import { ChtiotClientService } from './modules/chtiot-client/chtiot-client.service';

@Injectable()
export class AppService {
  constructor(
    private configService: ConfigService,
    private readonly chtiotClientService: ChtiotClientService,
  ) { }

  private readonly logger = new Logger(AppService.name);

  getHello(): string {
    return `Welcome to CityOS Server (v${process.env.npm_package_version})`;
  }

  async health(): Promise<any> {
    // Try to connect to MongoDB
    const response = {
      appVersion: process.env.npm_package_version,
      dbMongo: 'disconnected',
      dbRedis: 'disconnected',
    };

    await mongoose.connect(this.configService.get<string>('MONGODB_URI'));

    if (mongoose.connection.readyState === 1) {
      response.dbMongo = 'connected';
    }

    // Try to connect to Redis
    const redis = new Redis(this.configService.get<string>('REDIS_URI'));

    await new Promise<void>((resolve, _reject) => {
      redis.ping((error, result) => {
        if (result === 'PONG') {
          response.dbRedis = 'connected';
        } else {
          response.dbRedis = 'disconnected';
        }

        if (error) {
          this.logger.error(`Redis Error: ${error.message}`);
        }
        resolve();
      });
    });
    return response;
  }

  async updateSensors(updateSensorDto: UpdateSensorsDto): Promise<boolean> {
    const dateArrays: Date[] = [];

    const jsFrom = new Date(updateSensorDto.from);
    const jsTo = new Date(updateSensorDto.to || new Date());

    const from = DateTime.fromJSDate(jsFrom);
    const to = DateTime.fromJSDate(jsTo);

    let current = from;

    do {
      dateArrays.push(current.toJSDate());
      current = current.plus({ minutes: updateSensorDto.intervalInMunutes });
    } while (current.toSeconds() <= to.toSeconds());

    const delayIncrement = 50;
    let delay = 0;

    const results = await Promise.all(
      dateArrays.map(async (it) => {
        let value: string | number;
        if (updateSensorDto.values) {
          value =
            updateSensorDto.values[
            Math.floor(Math.random() * updateSensorDto.values.length)
            ];
        } else {
          value = Math.floor(
            Math.random() * (updateSensorDto.max - updateSensorDto.min + 1) +
            updateSensorDto.min,
          );
        }

        await new Promise((resolve) =>
          setTimeout(resolve, (delay += delayIncrement)),
        );

        return this.chtiotClientService.updateSensor(
          updateSensorDto.projectKey,
          updateSensorDto.deviceId,
          updateSensorDto.sensorId,
          value,
          it,
        );
      }),
    );
    return results.every((it) => it === true);
  }
}
