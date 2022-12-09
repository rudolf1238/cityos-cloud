import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { MalDevice } from 'src/models/maldevice';
import {
  PageInfo,
  MalDeviceEdge,
  MalDeviceConnection,
  MalDeviceInput,
  MalDeviceUpdate,
  MaldeviceFilter,
  MaldeviceSortField,
  SortOrder,
} from 'src/graphql.schema';
import { ErrorCode } from 'src/models/error.code';
import { ApolloError } from 'apollo-server-express';
import StringUtils from 'src/utils/StringUtils';
import { GroupService } from '../group/group.service';
import { UserService } from '../user/user.service';
import { MalDeviceDocument } from '../../models/maldevice';
//import { TypePredicate } from '@ts-morph/common/lib/typescript';

@Injectable()
export class MaldeviceService /*implements OnModuleInit*/ {
  constructor(
    @InjectModel(MalDevice.name)
    private readonly malDeviceModel: Model<MalDeviceDocument>,
    @Inject(forwardRef(() => GroupService))
    private groupService: GroupService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {}

  private readonly logger = new Logger(MaldeviceService.name);

  async getMalDevices(
    groupId: string,
    filter?: MaldeviceFilter,
    size?: number,
    after?: string,
  ): Promise<MalDeviceConnection> {
    let filterCondition = {};
    const sortField = filter?.maldeviceSortField
      ? filter.maldeviceSortField
      : MaldeviceSortField.NAME;
    const sortOrder = filter?.sortOrder
      ? filter.sortOrder
      : SortOrder.ASCENDING;
    let mainCondition = filterCondition;
    let pageCondition = {};

    const ids = [new Types.ObjectId(groupId)]; // only include own group
    const groupCondition = {
      $and: [
        {
          division_id: { $in: ids },
        },
      ],
    };

    if (filter) {
      const { keyword } = filter;
      const regKeyword = new RegExp(StringUtils.escapeRegExp(keyword), 'i');

      filterCondition = {
        $and: [
          groupCondition,
          {
            $or: [
              { name: { $regex: regKeyword } },
              //  { status: { $regex: regKeyword } },
              //  { deviceType: { $regex: regKeyword } },
              // { notifyType: { $regex: regKeyword } },
            ],
          },
        ],
      };
    }
    // console.log('after', after);
    if (after) {
      const lastMaldevice = await this.malDeviceModel.findOne({
        _id: after,
      });

      switch (sortField) {
        case MaldeviceSortField.NAME:
          pageCondition = {
            $or: [
              {
                name:
                  sortOrder === SortOrder.ASCENDING
                    ? { $gt: lastMaldevice.name }
                    : { $lt: lastMaldevice.name },
              },
              {
                name: lastMaldevice.name,
                _id: { $gt: after },
              },
            ],
          };
          break;
        case MaldeviceSortField.STATUS:
          pageCondition = {
            $or: [
              {
                status:
                  sortOrder === SortOrder.ASCENDING
                    ? { $gt: lastMaldevice.status }
                    : { $lt: lastMaldevice.status },
              },
              {
                status: lastMaldevice.status,
                _id: { $gt: after },
              },
            ],
          };
          break;

        default:
          this.logger.error(
            `Cannot find the ${filter.maldeviceSortField} when getMaldevices.`,
          );
          throw new ApolloError(
            `Cannot find the ${filter.maldeviceSortField} when getMaldevices.`,
            ErrorCode.INPUT_PARAMETERS_INVALID,
          );
      }
    }

    mainCondition = {
      $and: [filterCondition, pageCondition],
    };

    let sortCondition = {};
    switch (sortField) {
      case MaldeviceSortField.NAME:
        sortCondition = {
          name: sortOrder === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      case MaldeviceSortField.STATUS:
        sortCondition = {
          status: sortOrder === SortOrder.ASCENDING ? 1 : -1, // 1 for ascending, -1 for descending
          _id: 1,
        };
        break;
      default:
        this.logger.error(
          `Cannot find the ${filter.maldeviceSortField} when getMaldevices.`,
        );
        throw new ApolloError(
          `Cannot find the ${filter.maldeviceSortField} when getMaldevices.`,
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
    }

    const queryAfterLimit = await this.malDeviceModel
      .find(mainCondition)
      .limit(size)
      .sort(sortCondition)
      .exec();

    const queryAfterLimitMore = await this.malDeviceModel
      .find(mainCondition)
      .limit(size + 1)
      .sort(sortCondition)
      .exec();

    const edges: MalDeviceEdge[] = [];
    for (let i = 0; i < queryAfterLimit.length; i++) {
      const edge = new MalDeviceEdge();
      edge.node = queryAfterLimit[i].toApolloMalDevice();
      edge.cursor = (queryAfterLimit[i]._id as Types.ObjectId).toHexString();
      edges.push(edge);
    }

    const malDeviceConnection = new MalDeviceConnection();
    malDeviceConnection.edges = edges;

    malDeviceConnection.totalCount = await this.malDeviceModel
      .find(filterCondition)
      .countDocuments();

    const pageInfo = new PageInfo();
    if (queryAfterLimit.length > 0) {
      pageInfo.endCursor = (
        queryAfterLimit[queryAfterLimit.length - 1]._id as Types.ObjectId
      ).toHexString();
    }

    console.log('queryAfterLimit.length', queryAfterLimit.length);
    console.log('queryAfterLimitMore.length', queryAfterLimitMore.length);
    pageInfo.hasNextPage =
      queryAfterLimit.length === size &&
      queryAfterLimitMore.length > queryAfterLimit.length;
    malDeviceConnection.pageInfo = pageInfo;
    return malDeviceConnection;
  }

  async findMalDevice(name: string): Promise<MalDevice | null> {
    const MalDeviceData = await this.malDeviceModel.findOne({
      name: name,
    });
    return MalDeviceData;
  }

  async findUserName(id: string): Promise<string> {
    const user = await this.userService.findUserById(id);
    return user.email;
  }

  async findUserId(name: string): Promise<string> {
    const user = await this.userService.findUser(name);
    return user._id.toHexString();
  }

  async add(groupId: string, malDeviceInput: MalDeviceInput): Promise<boolean> {
    const group = await this.groupService.getGroup(groupId);
    if (group === null) {
      throw new ApolloError(
        `Cannot find group ${groupId} in the database.`,
        ErrorCode.GROUP_NOT_FOUND,
      );
    }

    const maldevicedata = await this.findMalDevice(malDeviceInput.name);

    if (maldevicedata !== null) {
      throw new ApolloError(
        `have duplicate ${maldevicedata.name} in the database.`,
        ErrorCode.NAME_DUPLICATED,
      );
    } else {
      const malDevice = new MalDevice();
      malDevice.name = malDeviceInput.name;
      malDevice.notifyType = malDeviceInput.notifyType;
      malDevice.deviceType = malDeviceInput.deviceType;
      //new Types.ObjectId('000000015cc28d1fbcdd0238')
      malDevice.status = malDeviceInput.status;

      malDevice.division_id = malDeviceInput.division_id.flatMap(
        (it) => new Types.ObjectId(it),
      );

      await this.malDeviceModel.create(malDevice);
      await this.findMalDevice(malDeviceInput.name);

      return true;
    }
  }

  async update(
    _groupId: string,
    malDeviceUpdate: MalDeviceUpdate,
  ): Promise<boolean> {
    const MalDeviceDataExist = await this.malDeviceModel.findOne({
      name: malDeviceUpdate.name,
    });

    if (
      MalDeviceDataExist !== null &&
      malDeviceUpdate.name !== malDeviceUpdate.queryname
    ) {
      throw new ApolloError(
        `have duplicate ${MalDeviceDataExist.name} in the database.`,
        ErrorCode.NAME_DUPLICATED,
      );
    } else {
      const MalDeviceData = await this.malDeviceModel.findOne({
        name: malDeviceUpdate.queryname,
      });

      const malDevice = new MalDevice();
      malDevice.name = malDeviceUpdate.name;
      malDevice.notifyType = malDeviceUpdate.notifyType;
      malDevice.deviceType = malDeviceUpdate.deviceType;
      // new Types.ObjectId('000000015cc28d1fbcdd0238')
      malDevice.division_id = malDeviceUpdate.division_id.flatMap(
        (it) => new Types.ObjectId(it),
      );
      malDevice.status = malDeviceUpdate.status;

      await this.malDeviceModel.findByIdAndUpdate(
        { _id: MalDeviceData._id as Types.ObjectId },
        malDevice,
      );
      return true;
    }
  }

  async delete(_groupId: string, names: string[]): Promise<string[]> {
    const deletable: string[] = [];
    await Promise.all(
      names.flatMap(async (it) => {
        const maldevice = await this.findMalDevice(it);
        const groupsForMalDevice = maldevice.division_id.flatMap((divideid) =>
          divideid._id.toHexString(),
        );
        if (groupsForMalDevice.length > 0) {
          await this.malDeviceModel.findByIdAndDelete(maldevice._id);
          deletable.push(maldevice.name);
        } else {
          throw new ApolloError(
            `Cannot find maldevice_name - ${it} in the group. - ${groupsForMalDevice[0]}`,
            ErrorCode.DEVICE_NOT_FOUND,
          );
        }
      }),
    );
    return deletable;
  }
}
