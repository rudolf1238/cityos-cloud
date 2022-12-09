import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { GoogleClientService } from './google-client.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [GoogleClientService],
  exports: [GoogleClientService],
})
export class GoogleClientModule {}
