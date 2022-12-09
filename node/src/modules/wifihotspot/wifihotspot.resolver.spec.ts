import { Test, TestingModule } from '@nestjs/testing';
import { WifihotspotResolver } from './wifihotspot.resolver';

describe('WifihotspotResolver', () => {
  let resolver: WifihotspotResolver;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WifihotspotResolver],
    }).compile();

    resolver = module.get<WifihotspotResolver>(WifihotspotResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });
});
