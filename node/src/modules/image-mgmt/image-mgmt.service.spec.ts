import { Test, TestingModule } from '@nestjs/testing';
import { ImageMgmtService } from './image-mgmt.service';
import { ConfigModule } from '@nestjs/config';
// import { GroupService } from '../group/group.service';
// import { MockType } from 'src/app.controller.spec';

// const groupServiceMock: () => MockType<GroupService> = jest.fn(() => ({
//   create: jest.fn(),
// }));

describe('ImageMgmtService', () => {
  let service: ImageMgmtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '../env/cityos_env',
        }),
        ConfigModule,
      ],
      providers: [
        ImageMgmtService,
        // {
        //   provide: GroupService,
        //   useFactory: groupServiceMock,
        // },
      ],
    }).compile();

    service = module.get<ImageMgmtService>(ImageMgmtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
