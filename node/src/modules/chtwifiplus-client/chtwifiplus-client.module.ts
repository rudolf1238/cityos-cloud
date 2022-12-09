import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ChtwifiplusClientService } from './chtwifiplus-client.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [ChtwifiplusClientService],
  exports: [ChtwifiplusClientService],
})
export class ChtwifiplusClientModule {}
