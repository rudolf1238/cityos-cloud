import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ResponseMSGConnection,
  ResponseMSGEdge,
  ResponseMSGGroup,
  ResponseMSG_Merge_Connection,
  ResponseMSG_Merge_Edge,
  ResponseMSG_Merge,
  ResponseMSG_Son,
  MessageboardInput,
  MessageboardInputSon,
  UpdateMessageboardInput,
  UpdateMessageboardSonInput,
  Response_MaintenanceUser,
  MaintenanceUserEdge,
} from 'src/graphql.schema';
import { GroupService } from '../group/group.service';
import {
  DeviceMessageboard,
  DeviceMessageboardDocument,
} from 'src/models/device.messagebord';
import {
  DeviceMessageboardSon,
  DeviceMessageboardSonDocument,
} from 'src/models/device.messagebordSon';
import { MaintenanceStaff } from 'src/models/maintenance_staff';
import { ApolloError } from 'apollo-server-express';
import { ErrorCode } from 'src/models/error.code';
import { UserService } from '../user/user.service';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class AbnormalResponseMsgService {
  constructor(
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @InjectModel(DeviceMessageboard.name)
    private readonly ResponseMSGModel: Model<DeviceMessageboardDocument>,
    @InjectModel(DeviceMessageboardSon.name)
    private readonly ResponseMSG_Son_Model: Model<DeviceMessageboardSonDocument>,
    @InjectModel(MaintenanceStaff.name)
    private readonly Maintenance_staffModel: Model<MaintenanceStaff>,

    @Inject(forwardRef(() => GroupService))
    private groupService: GroupService,
  ) {}

  private readonly logger = new Logger(AbnormalResponseMsgService.name);

  async getResponseMsg(
    groupId: string,
    deviceIds: string[],
    page: number,
    size: number,
  ): Promise<ResponseMSGConnection> {
    this.logger.log('groupId:' + groupId);

    const queryAfterLimit = await this.ResponseMSGModel.find({
      deviceId: { $in: deviceIds },
    })
      .sort({ updatedAt: -1 })
      .populate({ path: 'user' })
      .skip(page * size)
      .limit(size)
      .exec();

    const edges: ResponseMSGEdge[] = [];

    queryAfterLimit.forEach((ResponseMSG) => {
      console.info(ResponseMSG._id);
      const edge = new ResponseMSGEdge();
      edge.node = ResponseMSG.toApolloResponseMSG();
      edge.cursor = ResponseMSG._id as string;
      edges.push(edge);
    });

    const responseMSGconnection = new ResponseMSGConnection();
    responseMSGconnection.edges = edges;
    const ids = await this.groupService.getAllChilds(
      new Types.ObjectId(groupId),
      true,
    );

    const idsnames = [];
    const groups = [] as ResponseMSGGroup[];

    for (const x of ids) {
      const group = await this.groupService.getGroup(x.toString());
      idsnames.push(group.name);
      const responseMSGgroup = new ResponseMSGGroup();
      responseMSGgroup.id = x.toString();
      responseMSGgroup.value = group.name;
      responseMSGgroup.label = group.name;
      groups.push(responseMSGgroup);
    }

    responseMSGconnection.groups = groups;
    return responseMSGconnection;
  }

  async getResponseMsg_Son(
    message: ResponseMSGConnection,
  ): Promise<ResponseMSG_Merge_Connection> {
    const edgemerges: ResponseMSG_Merge_Edge[] = [];

    for (const responseMSGEdge of message.edges) {
      const queryAfterLimitSon = await this.ResponseMSG_Son_Model.find({
        msgId: responseMSGEdge.cursor,
      })
        .sort({ updatedAt: 1 })
        .populate({ path: 'user' })
        .exec();

      const edgeson: ResponseMSG_Son[] = [];

      for (const ResponseSon of queryAfterLimitSon) {
        const edge = ResponseSon.toApolloResponseMSGSon();
        // edge.
        // edge.cursor = ResponseSon._id.toHexString();
        edgeson.push(edge);
      }
      const responseMSGMerge = new ResponseMSG_Merge();
      responseMSGMerge.responsemsgFa = responseMSGEdge.node;
      responseMSGMerge.responsemsgSon = edgeson;

      const edgemerge = new ResponseMSG_Merge_Edge();
      edgemerge.node = responseMSGMerge;
      edgemerge.cursor = responseMSGEdge.cursor;
      edgemerges.push(edgemerge);
    }

    const responseMSGMergeConnection = new ResponseMSG_Merge_Connection();
    responseMSGMergeConnection.edges = edgemerges;
    //   console.info(ResponseMSG._id);
    console.log('edgemerge' + ';nqueryAfterLimit', responseMSGMergeConnection);
    // });

    responseMSGMergeConnection.groups = message.groups;
    return responseMSGMergeConnection;
  }

  async getMaintenanceUser(
    groupId: string,
    deviceId: Types.ObjectId,
  ): Promise<Response_MaintenanceUser> {
    // const id = new mongoose.Types.ObjectId(deviceId);

    const out = await this.Maintenance_staffModel.find({
      device: deviceId,
    });

    const maintenanceUser = new Response_MaintenanceUser();
    const edges: MaintenanceUserEdge[] = [];
    for (const maintenanceDetail of out) {
      const userDetail = await this.userService.findUserById(
        maintenanceDetail.userId,
      );
      const edge = new MaintenanceUserEdge();
      edge.id = userDetail._id.toString();
      edge.name = userDetail.name;
      edge.email = userDetail.email;
      edges.push(edge);
    }
    maintenanceUser.edge = edges;
    return maintenanceUser;
  }

  async addMessageboard(
    projectKey: string,
    groupId: string,
    messageboardInput: MessageboardInput,
  ): Promise<boolean> {
    const group = await this.groupService.getGroup(groupId);
    if (group === null) {
      throw new ApolloError(
        `Cannot find group ${groupId} in the database.`,
        ErrorCode.GROUP_NOT_FOUND,
      );
    }

    if (
      messageboardInput.content == null ||
      messageboardInput.content.length == 0
    ) {
      throw new ApolloError(`MSG content is empty`, ErrorCode.MESSAGE_IS_EMPTY);
    }
    const userId = (await this.userService.findUser(messageboardInput.user)).id;

    const msg = new DeviceMessageboard();
    msg.deviceId = messageboardInput.deviceId;
    msg.content = messageboardInput.content;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    msg.user = Object(userId);
    msg.status = messageboardInput.status;
    msg.pictureId = messageboardInput.file;
    await this.ResponseMSGModel.create(msg);

    return true;
  }

  async addMessageboardSon(
    projectKey: string,
    groupId: string,
    messageboardInputSon: MessageboardInputSon,
  ): Promise<boolean> {
    // check the deviceId is not empty
    console.log('----msg_son:' + messageboardInputSon.msgId);
    const group = await this.groupService.getGroup(groupId);
    if (group === null) {
      throw new ApolloError(
        `Cannot find group ${groupId} in the database.`,
        ErrorCode.GROUP_NOT_FOUND,
      );
    }
    if (
      messageboardInputSon.content == null ||
      messageboardInputSon.content.length == 0
    ) {
      throw new ApolloError(`MSG content is empty`, ErrorCode.MESSAGE_IS_EMPTY);
    }

    const userId = (await this.userService.findUser(messageboardInputSon.user))
      .id;
    const msg = new DeviceMessageboardSon();
    msg.deviceId = messageboardInputSon.deviceId;
    msg.content = messageboardInputSon.content;
    msg.msgId = messageboardInputSon.msgId;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    msg.user = Object(userId);
    msg.pictureId = messageboardInputSon.file;
    msg.status = messageboardInputSon.status;

    await this.ResponseMSG_Son_Model.create(msg);
    return true;
  }

  async updateMessageboard(
    projectKey: string,
    groupId: string,
    updateMessageboardInput: UpdateMessageboardInput,
  ): Promise<boolean> {
    // check the deviceId is not empty
    console.log('----Update msg:' + updateMessageboardInput.content);
    if (updateMessageboardInput.content.length == 0) {
      return false;
    }
    await this.ResponseMSGModel.findByIdAndUpdate(updateMessageboardInput.id, {
      $set: {
        content: updateMessageboardInput.content,
      },
    });
    if (updateMessageboardInput.file.length != 0) {
      await this.ResponseMSGModel.findByIdAndUpdate(
        updateMessageboardInput.id,
        {
          $set: {
            pictureId: updateMessageboardInput.file,
          },
        },
      );
    }
    return true;
  }

  async updateMessageboardSon(
    projectKey: string,
    groupId: string,
    updateMessageboardSonInput: UpdateMessageboardSonInput,
  ): Promise<boolean> {
    // check the deviceId is not empty
    console.log('----Update msg:' + updateMessageboardSonInput.content);
    if (updateMessageboardSonInput.content.length == 0) {
      return false;
    }
    await this.ResponseMSG_Son_Model.findByIdAndUpdate(
      updateMessageboardSonInput.id,
      {
        $set: {
          content: updateMessageboardSonInput.content,
        },
      },
    );
    if (updateMessageboardSonInput.file.length != 0) {
      await this.ResponseMSG_Son_Model.findByIdAndUpdate(
        updateMessageboardSonInput.id,
        {
          $set: {
            pictureId: updateMessageboardSonInput.file,
          },
        },
      );
    }

    return true;
  }

  async deleteMessageboard(id: string): Promise<boolean> {
    console.log('remove id:' + id);
    await this.ResponseMSGModel.findByIdAndDelete(id);
    return true;
  }

  async deleteMessageboardSon(id: string): Promise<boolean> {
    console.log('remove id:' + id);
    await this.ResponseMSG_Son_Model.findByIdAndDelete(id);
    return true;
  }
}
