/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ApolloError } from 'apollo-server-express';
import { getModelToken } from '@nestjs/mongoose';
import { MockType } from 'src/app.controller.spec';
import { ErrorCode } from 'src/models/error.code';
import { Group } from 'src/models/group';
import { GroupInfo, User } from 'src/models/user';
import { CreateGroupInput, Level } from 'src/graphql.schema';
import { Types } from 'mongoose';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { DeviceService } from '../device/device.service';
import { UserService } from '../user/user.service';
import { GroupService } from './group.service';

const g = new Group();
g._id = new Types.ObjectId('000000015cc28d1fbcdd0238');
g.name = 'Mock Group 1';
g.ancestors = [
  new Types.ObjectId('000000015cc28d1fbcdd0240'),
  new Types.ObjectId('000000015cc28d1fbcdd0242'),
];

const gInfo = new GroupInfo();
gInfo.inUse = true;
gInfo.group = g;

const user = new User();
user.name = 'mockUser';
user.email = 'mockUser@test.com';
user.groups = [gInfo];

const userServiceMock: () => MockType<UserService> = jest.fn(() => ({
  findUserById: jest.fn(() => {
    return user as unknown as User;
  }),
  findUser: jest.fn(() => new User()),
}));

const deviceServiceMock: () => MockType<DeviceService> = jest.fn(() => ({
  getDeviceById: jest.fn(),
  searchDevices: jest.fn(),
}));

describe('GroupService', () => {
  let service: GroupService;
  beforeEach(async () => {
    const mockGroupModel = {
      find: jest.fn((query) => {
        const group1 = new Group();
        group1.name = 'Mock Group 1';
        group1._id = new Types.ObjectId('000000015cc28d1fbcdd0238');

        const group2 = new Group();
        group2._id = new Types.ObjectId('000000015cc28d1fbcdd0240');
        group2.name = 'Mock Group 2';

        const group3 = new Group();
        group3._id = new Types.ObjectId('000000015cc28d1fbcdd0242');
        group3.name = 'Mock Group 3';

        if (query.ancestors?.toHexString() === '000000015cc28d1fbcdd0238') {
          return [group2, group3];
        }
        return [group1, group2, group3];
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      imports: [ChtiotClientModule, ConfigModule],
      providers: [
        GroupService,
        {
          provide: getModelToken('Group'),
          useValue: mockGroupModel,
        },
        {
          provide: UserService,
          useFactory: userServiceMock,
        },
        {
          provide: DeviceService,
          useFactory: deviceServiceMock,
        },
      ],
    }).compile();

    service = module.get<GroupService>(GroupService);
  });

  it('should list all descendant groups by searchGroups', async () => {
    expect(service).toBeDefined();
    const groups = await service.searchGroups(user);
    expect(groups.length).toEqual(3);

    groups.forEach((group) => {
      switch (group._id.toHexString()) {
        case '000000015cc28d1fbcdd0238':
          expect(group.name).toEqual('Mock Group 1');
          break;
        case '000000015cc28d1fbcdd0240':
          expect(group.name).toEqual('Mock Group 2');
          break;
        case '000000015cc28d1fbcdd0242':
          expect(group.name).toEqual('Mock Group 3');
          break;
        default:
          break;
      }
    });
  });

  it('should throw the error when createGroup more than maximum depth', async () => {
    const group = new Group();
    group.name = 'Mock 6th Level';
    group._id = new Types.ObjectId(6);
    group.ancestors = [
      new Types.ObjectId(1),
      new Types.ObjectId(2),
      new Types.ObjectId(3),
      new Types.ObjectId(4),
      new Types.ObjectId(5),
    ];
    jest.spyOn(service, 'getGroup').mockResolvedValue(group);

    const input = new CreateGroupInput();
    input.name = 'Mock 7th Level';
    input.parentGroupId = '7';

    try {
      await service.create(input);
      throw new Error();
    } catch (error) {
      if (error instanceof ApolloError) {
        expect(error.extensions.code).toEqual(
          ErrorCode.GROUP_LEVEL_LIMIT_REACH,
        );
      } else {
        throw new Error(
          'It shoulds throws error of GROUP_LEVEL_LIMIT_REACH when the maximum depth of the group is reached.',
        );
      }
    }
  });

  it('should throw the error when delete the group you cannot delete', async () => {
    const deletedGroup = new Group();
    deletedGroup.name = 'Try to delete me';
    deletedGroup._id = new Types.ObjectId();
    // try to delete the group at PARENT level
    try {
      await service.deleteGroup(user, deletedGroup, Level.PARENT);
      throw new Error();
    } catch (error) {
      if (error instanceof ApolloError) {
        expect(error.extensions.code).toEqual(ErrorCode.GROUP_DELETE_FAIL);
      } else {
        throw new Error(
          'It shoulds throws error if you delete the group not at LEAF level.',
        );
      }
    }

    // try to delete the group you are using
    deletedGroup._id = new Types.ObjectId('000000015cc28d1fbcdd0238');
    try {
      await service.deleteGroup(
        user as unknown as User,
        deletedGroup,
        Level.LEAF,
      );
      throw new Error();
    } catch (error) {
      if (error instanceof ApolloError) {
        expect(error.extensions.code).toEqual(ErrorCode.GROUP_DELETE_FAIL);
      } else {
        throw new Error(
          'It shoulds throws error if you delete the group you are using.',
        );
      }
    }
  });
});
