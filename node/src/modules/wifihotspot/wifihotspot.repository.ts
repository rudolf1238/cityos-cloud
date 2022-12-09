import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import {
  Group,
  WifiSortField,
  SortOrder,
  WifiFilter,
} from 'src/graphql.schema';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/models/user';
import { Model, Types } from 'mongoose';
import { Group as GroupModel, GroupDocument } from 'src/models/group';
import { AddCompanyAreaOwner } from '../chtwifiplus-client/chtwifiplus-client.service';
import { ApolloError } from 'apollo-server-express';
import { GroupService } from '../group/group.service';
export interface DivisionCount {
  divisionCount: number;
}
@Injectable()
export class WifihotspotRepository {
  private readonly logger = new Logger(WifihotspotRepository.name);

  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    // @InjectModel(Device)
    // private readonly deviceModel: ReturnModelType<typeof Device>,
    @InjectModel(GroupModel.name)
    private readonly groupModel: Model<GroupDocument>,
    @Inject(forwardRef(() => GroupService))
    private groupService: GroupService,
  ) {}

  async getDivisionwithUser(
    groupId: string,
    userId: string,
    currentPage: number,
    pageCount: number,
    filter?: WifiFilter,
  ): Promise<Group[]> {
    //const userId = new Types.ObjectId(user.id);
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );
    const sortField = filter?.sortField ? filter.sortField : WifiSortField.ID;
    const sortOrder = filter?.sortOrder
      ? filter.sortOrder
      : SortOrder.ASCENDING;

    let regex = '';
    if (filter && filter.keyword) {
      const { keyword } = filter;
      regex = keyword;
    }

    let sort: Record<string, 1 | -1 | { $meta: 'textScore' }>;
    // const regKeyword = new RegExp(StringUtils.escapeRegExp(keyword), 'i');
    try {
      switch (sortField) {
        case WifiSortField.ID:
          if (sortOrder === SortOrder.ASCENDING) {
            sort = { id: 1 };
          } else {
            sort = { id: -1 };
          }
          break;
        case WifiSortField.NAME:
          if (sortOrder === SortOrder.ASCENDING) {
            sort = { name: 1 };
          } else {
            sort = { name: -1 };
          }
          break;
        case WifiSortField.COMPANYID:
          if (sortOrder === SortOrder.ASCENDING) {
            sort = { companyId: 1 };
          } else {
            sort = { companyId: -1 };
          }
          break;
      }
      // const sort: Record<string, 1 | -1 | { $meta: 'textScore' }> = {
      //   id: -1,
      // };
      const divisions: Group[] = await this.userModel.aggregate([
        { $match: { _id: new Types.ObjectId(userId) } },
        { $unwind: '$groups' },
        {
          $lookup: {
            from: 'groups',
            localField: 'groups.group',
            foreignField: '_id',
            as: 'UserGroup',
          },
        },
        { $unwind: '$UserGroup' },
        {
          $lookup: {
            from: 'devices',
            localField: 'groups.group',
            foreignField: 'groups',
            as: 'UserGroupDevice',
          },
        },
        { $unwind: '$UserGroupDevice' },
        {
          $match: { 'UserGroupDevice.type': 'WIFI' },
        },
        // {
        //   $match: {
        //     $and: [
        //       { 'UserGroupDevice.type': 'WIFI' },
        //       { 'UserGroupDevice.groups': { $in: ids } },
        //     ],
        //   },
        // },
        {
          $group: {
            _id: {
              groupId: '$groups.group',
              groupName: '$UserGroup.name',
              // parent: '$UserGroup.parent',
              // ancestors: '$UserGroup.ancestors',
              // projectKey: '$UserGroup.projectKey',
              // sensorMask: '$UserGroup.sensorMask',
              // projectId: '$UserGroup.projectId',
              companyId: '$UserGroup.companyId',
              logo: '$UserGroup.logo',
              line: '$UserGroup.line',
              url: '$UserGroup.url',
            },
          },
        },
        {
          $project: {
            _id: 0,
            id: '$_id.groupId',
            name: '$_id.groupName',
            // parent: '$_id.parent',
            // ancestors: '$_id.ancestors',
            // projectKey: '$_id.projectKey',
            // sensorMask: '$_id.sensorMask',
            // projectId: '$_id.projectId',
            companyId: '$_id.companyId',
            line: '$_id.line',
            logo: '$_id.logo',
            url: '$_id.url',
          },
        },
        {
          $match: {
            $and: [
              { id: { $in: ids } },
              {
                $or: [
                  { name: { $regex: regex } },
                  { companyId: { $regex: regex } },
                ],
              },
            ],
          },
        },
        { $sort: sort },
        { $skip: (currentPage - 1) * pageCount },
        { $limit: pageCount },
      ]);
      return divisions;
    } catch (err) {
      if (err instanceof Error) {
        throw new ApolloError(
          `getDivisionwithUser Fail,Update City OS DB Fail with error = ${err.message}`,
          '400',
        );
      }
    }
  }

  async getDivisionCount(
    groupId: string,
    userId: string,
    filter: WifiFilter,
  ): Promise<DivisionCount[]> {
    //const userId = new Types.ObjectId(user.id);
    try {
      let regex = '';
      if (filter && filter.keyword) {
        const { keyword } = filter;
        regex = keyword;
      }
      const ids = await this.groupService.getAllChilds(
        new Types.ObjectId(groupId),
        true,
      );
      const divisionCount: DivisionCount[] = await this.userModel.aggregate([
        { $match: { _id: new Types.ObjectId(userId) } },
        { $unwind: '$groups' },
        {
          $lookup: {
            from: 'groups',
            localField: 'groups.group',
            foreignField: '_id',
            as: 'UserGroup',
          },
        },
        { $unwind: '$UserGroup' },
        {
          $lookup: {
            from: 'devices',
            localField: 'groups.group',
            foreignField: 'groups',
            as: 'UserGroupDevice',
          },
        },
        { $unwind: '$UserGroupDevice' },
        {
          $match: { 'UserGroupDevice.type': 'WIFI' },
        },
        {
          $group: {
            _id: {
              groupId: '$groups.group',
              groupName: '$UserGroup.name',
              // parent: '$UserGroup.parent',
              // ancestors: '$UserGroup.ancestors',
              // projectKey: '$UserGroup.projectKey',
              // sensorMask: '$UserGroup.sensorMask',
              // projectId: '$UserGroup.projectId',
              companyId: '$UserGroup.companyId',
              logo: '$UserGroup.logo',
              url: '$UserGroup.url',
            },
          },
        },
        {
          $project: {
            _id: 0,
            id: '$_id.groupId',
            name: '$_id.groupName',
            // parent: '$_id.parent',
            // ancestors: '$_id.ancestors',
            // projectKey: '$_id.projectKey',
            // sensorMask: '$_id.sensorMask',
            // projectId: '$_id.projectId',
            companyId: '$_id.companyId',
            logo: '$_id.logo',
            url: '$_id.url',
          },
        },
        {
          $match: {
            $and: [
              { id: { $in: ids } },
              {
                $or: [
                  { name: { $regex: regex } },
                  { companyId: { $regex: regex } },
                ],
              },
            ],
          },
        },
        { $count: 'divisionCount' },
      ]);
      return divisionCount;
    } catch (err) {
      if (err instanceof Error) {
        throw new ApolloError(
          `getDivisionCount Fail with error = ${err.message}`,
          '400',
        );
      }
    }
  }

  async updategroup(
    divisionId: string,
    wifiplusCompany: AddCompanyAreaOwner,
  ): Promise<GroupModel> {
    try {
      const groupupdate: GroupModel = await this.groupModel.findByIdAndUpdate(
        divisionId,
        {
          $set: {
            companyId: wifiplusCompany.id.toString(),
            logo: wifiplusCompany.logo,
            line: wifiplusCompany.line,
            url: wifiplusCompany.url,
          },
        },
        { new: true },
        // function (err, result) {
        //   if (err) {
        //     console.log(err);
        //   } else {
        //     return result;
        //   }
        // },
      );
      return groupupdate;
    } catch (err) {
      if (err instanceof Error) {
        throw new ApolloError(
          `updategroup Fail,Update City OS DB Fail with error = ${err.message}`,
          '400',
        );
      }
    }
  }

  async getdivision(divisionId: string): Promise<GroupModel> {
    try {
      const groups = await this.groupModel.findOne({
        _id: new Types.ObjectId(divisionId),
      });
      return groups;
    } catch (err) {
      if (err instanceof Error) {
        throw new ApolloError(
          `getdivision Fail with error = ${err.message}`,
          '400',
        );
      }
    }
  }

  async deletegroup(divisionId: string): Promise<GroupModel> {
    try {
      const groupupdate: GroupModel = await this.groupModel.findByIdAndUpdate(
        divisionId,
        {
          $unset: {
            companyId: '',
            logo: '',
            line: '',
            url: '',
          },
        },
        { new: true },
      );
      return groupupdate;
    } catch (err) {
      if (err instanceof Error) {
        throw new ApolloError(
          `deletegroup Fail with error = ${err.message}`,
          '400',
        );
      }
    }
  }

  async updategroupforupdate(
    divisionId: string,
    wifiplusCompany: AddCompanyAreaOwner,
  ): Promise<GroupModel> {
    try {
      const groupupdate: GroupModel = await this.groupModel.findByIdAndUpdate(
        divisionId,
        {
          $set: {
            name: wifiplusCompany.name,
            logo: wifiplusCompany.logo,
            line: wifiplusCompany.line,
            url: wifiplusCompany.url,
          },
        },
        { new: true },
      );
      return groupupdate;
    } catch (err) {
      if (err instanceof Error) {
        this.logger.log(
          `updategroup Fail,Update City OS DB Fail with error = ${err.message}`,
        );
        return null;
      }
    }
  }
}
