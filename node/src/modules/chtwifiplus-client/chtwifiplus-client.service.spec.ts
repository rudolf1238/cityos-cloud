import { Test, TestingModule } from '@nestjs/testing';
import { ChtwifiplusClientService } from './chtwifiplus-client.service';

describe('ChtwifiplusClientService', () => {
  let service: ChtwifiplusClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChtwifiplusClientService],
    }).compile();

    service = module.get<ChtwifiplusClientService>(ChtwifiplusClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
