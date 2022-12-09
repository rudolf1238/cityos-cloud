import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ChtiotClientService } from './chtiot-client.service';

describe('ChtiotClientService', () => {
  let service: ChtiotClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [HttpModule, ConfigModule],
      providers: [ChtiotClientService],
    }).compile();

    service = module.get<ChtiotClientService>(ChtiotClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
