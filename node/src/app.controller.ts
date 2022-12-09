import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './modules/auth/auth.decorator';

export class UpdateSensorsDto {
  projectKey: string;

  deviceId: string;

  sensorId: string;

  from: string;

  to?: string;

  intervalInMunutes: number;

  max?: number;

  min?: number;

  values?: string[];
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Public()
  health(): any {
    return this.appService.health();
  }

  @Post('updateSensors')
  @Public()
  async updateSensors(
    @Body() updateSensorsDto: UpdateSensorsDto,
  ): Promise<boolean> {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }
    return this.appService.updateSensors(updateSensorsDto);
  }
}
