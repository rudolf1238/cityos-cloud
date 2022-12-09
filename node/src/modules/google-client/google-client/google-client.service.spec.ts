import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GoogleClientService } from './google-client.service';

describe('GoogleClientService', () => {
  let service: GoogleClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule, ConfigModule],
      providers: [GoogleClientService],
    }).compile();

    service = module.get<GoogleClientService>(GoogleClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
