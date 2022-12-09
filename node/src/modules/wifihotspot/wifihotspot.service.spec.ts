import { Test, TestingModule } from '@nestjs/testing';
import { WifihotspotService } from './wifihotspot.service';

describe('WifihotspotService', () => {
  let service: WifihotspotService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WifihotspotService],
    }).compile();

    service = module.get<WifihotspotService>(WifihotspotService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
