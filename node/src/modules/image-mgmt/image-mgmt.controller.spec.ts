import { Test, TestingModule } from '@nestjs/testing';
import { ImageMgmtController } from './image-mgmt.controller';
import { ImageMgmtService } from './image-mgmt.service';
import { ConfigModule } from '@nestjs/config';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { MockType } from 'src/app.controller.spec';

const groupServiceMock: () => MockType<GroupService> = jest.fn(() => ({
  create: jest.fn(),
}));
const userServiceMock: () => MockType<UserService> = jest.fn(() => ({
  findUserById: jest.fn(),
  findUser: jest.fn(),
}));

describe('ImageMgmtController', () => {
  let controller: ImageMgmtController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule],
      controllers: [ImageMgmtController],
      providers: [
        ImageMgmtService,
        {
          provide: GroupService,
          useFactory: groupServiceMock,
        },
        {
          provide: UserService,
          useFactory: userServiceMock,
        },
      ],
    }).compile();

    controller = module.get<ImageMgmtController>(ImageMgmtController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
