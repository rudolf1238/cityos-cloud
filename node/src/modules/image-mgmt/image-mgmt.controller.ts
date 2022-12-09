import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import fs from 'fs';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { CurrentUser, Public } from '../auth/auth.decorator';
import { ImageMgmtService } from './image-mgmt.service';
import {
  editFileName,
  imageFileFilter,
  imageFileFilter2,
} from './file-upload.utils';
import { ObjectId } from 'mongoose';
import {
  BasicResponseType,
  FileInfoType,
  UploadedFileType,
  UploadMultipleFilesType,
} from '../../models/image-mgmt';
import path from 'path';
import { FileInfoTypeWithObjectId } from '../../models/image-mgmt';
import { ApiConsumes, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { AppAbility } from '../permission/ability.factory';
import { Action, Subject } from 'src/graphql.schema';
import { GroupService } from '../group/group.service';
import { User } from 'src/models/user';
//import { ForbiddenError } from 'apollo-server-express';
import { Response } from 'express';
// import { ForbiddenError } from 'apollo-server-express';

const DEFAULT_DIRECTORY = '../../files';
export const UPLOAD_DIRECTORY_URL =
  process.env.UPLOAD_DIRECTORY_URL !== undefined
    ? path.isAbsolute(process.env.UPLOAD_DIRECTORY_URL)
      ? process.env.UPLOAD_DIRECTORY_URL
      : path.resolve(process.env.UPLOAD_DIRECTORY_URL) ||
        path.resolve(DEFAULT_DIRECTORY, '.')
    : path.resolve(DEFAULT_DIRECTORY, '.');
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024;
const MAX_FILE_SIZE2 =
  parseInt(process.env.MAX_FILE_SIZE2) || 100 * 1024 * 1024;

@ApiTags('image-mgmt')
@Controller('image-mgmt')
export class ImageMgmtController {
  constructor(
    private readonly imageMgmtService: ImageMgmtService,
    private configService: ConfigService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
  ) {}

  // 提供頭像編輯故將權限檢查移除
  // @UseGuards(PermissionGuard)
  // @CheckPermissions(
  //   (ability: AppAbility) =>
  //     ability.can(Action.ADD, Subject.ABNORMAL_MANAGEMENT) ||
  //     ability.can(Action.MODIFY, Subject.ABNORMAL_MANAGEMENT) ||
  //     ability.can(Action.ADD, Subject.MAINTENANCE_STAFF) ||
  //     ability.can(Action.MODIFY, Subject.MAINTENANCE_STAFF) ||
  //     ability.can(Action.ADD, Subject.INDOOR) ||
  //     ability.can(Action.MODIFY, Subject.INDOOR) ||
  //     ability.can(Action.ADD, Subject.DEVICE) ||
  //     ability.can(Action.MODIFY, Subject.DEVICE),
  // )
  @Public()
  @Post('uploadedFile')
  @ApiCreatedResponse({
    description: 'uploadedFile',
  })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        //destination: './files',
        destination: UPLOAD_DIRECTORY_URL,
        filename: editFileName,
      }),
      limits: {
        fileSize: MAX_FILE_SIZE,
      },
      fileFilter: imageFileFilter,
    }),
  )
  @ApiConsumes('multipart/form-data')
  async uploadedFile(
    // @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadedFileType> {
    //因為函式中沒有使用groupId, 所以理論上應該不用再次檢查groupId, 故停用以下程式碼片段
    /*
    const groupId = user !== undefined ? user.groups[0].group.id : '';
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    */

    const fileInfoList: FileInfoType[] = [];
    const fileInfo = {
      destination: file.destination,
      fieldname: file.fieldname,
      filename: file.filename,
      mimetype: file.mimetype,
      originalname: file.originalname,
      path: file.path,
      size: file.size,
    };

    fileInfoList.push(fileInfo);

    const insertedRes: object = await this.imageMgmtService.addImages(
      fileInfoList,
    );

    if (insertedRes !== undefined && insertedRes !== null) {
      const response: UploadedFileType = {
        returnCode: '200',
        message: 'File uploaded successfully!',
        fileInfo: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          _id: insertedRes[0]?._id || null,
          fieldname: file.fieldname,
          filename: file.filename,
          mimetype: file.mimetype,
          originalname: file.originalname,
          //path: file.path,
          size: file.size,
        },
      };
      return response;
    } else {
      const response: UploadedFileType = {
        returnCode: '400',
        message: 'File uploaded failure! (DB Error)',
        fileInfo: null,
      };
      return response;
    }
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.ADD, Subject.ABNORMAL_MANAGEMENT) ||
      ability.can(Action.MODIFY, Subject.ABNORMAL_MANAGEMENT) ||
      ability.can(Action.ADD, Subject.MAINTENANCE_STAFF) ||
      ability.can(Action.MODIFY, Subject.MAINTENANCE_STAFF) ||
      ability.can(Action.ADD, Subject.INDOOR) ||
      ability.can(Action.MODIFY, Subject.INDOOR) ||
      ability.can(Action.ADD, Subject.DEVICE) ||
      ability.can(Action.MODIFY, Subject.DEVICE),
  )
  //@Public()
  @Post('multiple')
  @ApiCreatedResponse({
    description: 'uploadMultipleFiles',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('image', 20, {
      storage: diskStorage({
        //destination: '../../files',
        destination: UPLOAD_DIRECTORY_URL,
        filename: editFileName,
      }),
      limits: {
        fileSize: MAX_FILE_SIZE,
      },
      fileFilter: imageFileFilter,
    }),
  )
  async uploadMultipleFiles(
    @CurrentUser() user: User,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ): Promise<UploadMultipleFilesType> {
    const fileInfoList: FileInfoType[] = [];

    //因為函式中沒有使用groupId, 所以理論上應該不用再次檢查groupId, 故停用以下程式碼片段
    /*
    const groupId = user !== undefined ? user.groups[0].group.id : '';
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    */

    files.forEach((file: Express.Multer.File) => {
      const fileReponse = {
        destination: file.destination,
        fieldname: file.fieldname,
        filename: file.filename,
        mimetype: file.mimetype,
        originalname: file.originalname,
        path: file.path,
        size: file.size,
      };
      fileInfoList.push(fileReponse);
    });

    //console.log(MAX_FILE_SIZE.toString());

    const insertedRes: object = await this.imageMgmtService.addImages(
      fileInfoList,
    );
    if (insertedRes !== undefined && insertedRes !== null) {
      const fileInfoListWithObjectId: FileInfoTypeWithObjectId[] = [];
      let i: number;

      for (i = 0; i < fileInfoList.length; i++) {
        const fileInfoWithObjectId = {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          _id: insertedRes[i]?._id || null,
          fieldname: fileInfoList[i].fieldname,
          filename: fileInfoList[i].filename,
          mimetype: fileInfoList[i].mimetype,
          originalname: fileInfoList[i].originalname,
          //path: fileInfoList[i].path,
          size: fileInfoList[i].size,
        };
        fileInfoListWithObjectId.push(fileInfoWithObjectId);
      }
      const response: UploadMultipleFilesType = {
        returnCode: '200',
        message: 'File uploaded successfully!',
        fileInfoList: fileInfoListWithObjectId,
      };
      return response;
    } else {
      const response: UploadMultipleFilesType = {
        returnCode: '400',
        message: 'Files uploaded failure! (DB Error)',
        fileInfoList: null,
      };
      return response;
    }
  }

  // 提供頭像編輯故將權限檢查移除
  // @UseGuards(PermissionGuard)
  // @CheckPermissions(
  //   (ability: AppAbility) =>
  //     ability.can(Action.VIEW, Subject.ABNORMAL_MANAGEMENT) ||
  //     ability.can(Action.VIEW, Subject.MAINTENANCE_STAFF) ||
  //     ability.can(Action.VIEW, Subject.INDOOR) ||
  //     ability.can(Action.VIEW, Subject.DEVICE),
  // )
  @Public()
  @Get(':id')
  @ApiCreatedResponse({
    description: 'getImagebyId',
  })
  async seeUploadedFilebyId(
    // @CurrentUser() user: User,
    @Param('id') id: ObjectId,
    @Res() res: Response,
  ) {
    //因為函式中沒有使用groupId, 所以理論上應該不用再次檢查groupId, 故停用以下程式碼片段
    /*
    const groupId = user !== undefined ? user.groups[0].group.id : '';
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    */

    if (id !== undefined) {
      const idInfo = { _id: id };
      const filenameDestination: { filename: string; destination: string } =
        await this.imageMgmtService.getFilenameAndDestinationbyId(idInfo);

      const filename = filenameDestination.filename;
      const destination =
        filenameDestination.destination || UPLOAD_DIRECTORY_URL;

      if (filename !== undefined && filename !== '') {
        return res.sendFile(filename, { root: destination });
      }
    }
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.ABNORMAL_MANAGEMENT) ||
      ability.can(Action.VIEW, Subject.MAINTENANCE_STAFF) ||
      ability.can(Action.VIEW, Subject.INDOOR) ||
      ability.can(Action.VIEW, Subject.DEVICE),
  )
  //@Public()
  @Get('fileName/:filename')
  @ApiCreatedResponse({
    description: 'getImagebyFilename',
  })
  async seeUploadedFilebyFilename(
    @CurrentUser() user: User,
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<any> {
    //因為函式中沒有使用groupId, 所以理論上應該不用再次檢查groupId, 故停用以下程式碼片段
    /*
    const groupId = user !== undefined ? user.groups[0].group.id : '';
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    */

    const destinationtemp =
      await this.imageMgmtService.getDestinationbyfilename(filename);
    const destination = destinationtemp || UPLOAD_DIRECTORY_URL;
    return res.sendFile(filename, { root: destination });
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.ABNORMAL_MANAGEMENT) ||
      ability.can(Action.VIEW, Subject.MAINTENANCE_STAFF) ||
      ability.can(Action.VIEW, Subject.INDOOR) ||
      ability.can(Action.VIEW, Subject.DEVICE),
  )
  //@Public()
  @Post('getImageList')
  @ApiCreatedResponse({
    description: 'getImageList',
  })
  async getImageList(
    @CurrentUser() user: User,
    @Res() res: Response,
  ): Promise<any> {
    const destination = UPLOAD_DIRECTORY_URL;

    //因為函式中沒有使用groupId, 所以理論上應該不用再次檢查groupId, 故停用以下程式碼片段
    /*
    const groupId = user !== undefined ? user.groups[0].group.id : '';
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    */

    fs.readdir(destination, function (err, files) {
      if (err) {
        res.status(500).send({
          message: 'Unable to scan files!',
        });
      }

      const fileInfos = [];

      files.forEach((file) => {
        fileInfos.push({
          name: file,
          url: destination + file,
        });
      });
      res.status(200).send(fileInfos);
    });
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.ABNORMAL_MANAGEMENT) ||
      ability.can(Action.REMOVE, Subject.ABNORMAL_MANAGEMENT) ||
      ability.can(Action.VIEW, Subject.MAINTENANCE_STAFF) ||
      ability.can(Action.REMOVE, Subject.MAINTENANCE_STAFF) ||
      ability.can(Action.VIEW, Subject.INDOOR) ||
      ability.can(Action.REMOVE, Subject.INDOOR) ||
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.REMOVE, Subject.DEVICE),
  )
  //@Public()
  @Post('deleteFilesbyIds')
  @ApiCreatedResponse({
    description: 'deleteFilesbyIds',
  })
  async deleteFilesbyIds(
    @CurrentUser() user: User,
    @Body() ids: Array<{ _id: ObjectId }>,
  ) {
    //因為函式中沒有使用groupId, 所以理論上應該不用再次檢查groupId, 故停用以下程式碼片段
    /*
    const groupId = user !== undefined ? user.groups[0].group.id : '';
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    */

    if (ids !== undefined && ids.length > 0) {
      let result: Promise<BasicResponseType>;
      let i: number;
      for (i = 0; i < ids.length; i++) {
        const idInfo = ids[i];
        const filenameDestination =
          await this.imageMgmtService.getFilenameAndDestinationbyId(idInfo);
        const filename: string = filenameDestination.filename;
        const destination: string = filenameDestination.destination;
        if (filename !== undefined && filename !== '') {
          result = this.deleteUploadedFilebyFilename_v3(filename, destination);

          if (result !== undefined) {
            if ((await result).returnCode !== '200') return result;
          } else {
            return {
              returnCode: '400',
              message: 'Failed to remove file!',
            };
          }
        } else {
          return {
            returnCode: '404',
            message: String().concat(
              'No such file or directory! ',
              '(_id=',
              idInfo._id.toString(),
              ')',
            ),
          };
        }
      }
      if ((await result).returnCode === '200') {
        return {
          returnCode: '200',
          message: 'File removed successfully!',
        };
      } else {
        return {
          returnCode: '400',
          message: 'Failed to remove file!',
        };
      }
    } else {
      return {
        returnCode: '400',
        message: 'Failed to remove file!',
      };
    }
  }

  // 提供頭像編輯故將權限檢查移除
  // @UseGuards(PermissionGuard)
  // @CheckPermissions(
  //   (ability: AppAbility) =>
  //     ability.can(Action.VIEW, Subject.ABNORMAL_MANAGEMENT) ||
  //     ability.can(Action.REMOVE, Subject.ABNORMAL_MANAGEMENT) ||
  //     ability.can(Action.VIEW, Subject.MAINTENANCE_STAFF) ||
  //     ability.can(Action.REMOVE, Subject.MAINTENANCE_STAFF) ||
  //     ability.can(Action.VIEW, Subject.INDOOR) ||
  //     ability.can(Action.REMOVE, Subject.INDOOR) ||
  //     ability.can(Action.VIEW, Subject.DEVICE) ||
  //     ability.can(Action.REMOVE, Subject.DEVICE),
  // )

  @Public()
  @Delete(':id')
  @ApiCreatedResponse({
    description: 'deleteFilebyId',
  })
  async deleteUploadedFilebyId(
    // @CurrentUser() user: User,
    @Param('id') id: ObjectId,
  ) {
    //因為函式中沒有使用groupId, 所以理論上應該不用再次檢查groupId, 故停用以下程式碼片段
    /*
    const groupId = user !== undefined ? user.groups[0].group.id : '';
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    */

    if (id !== undefined) {
      const idInfo = { _id: id };
      const filenameDestination =
        await this.imageMgmtService.getFilenameAndDestinationbyId(idInfo);
      const filename = filenameDestination.filename;
      const destination = filenameDestination.destination;

      if (filename !== undefined && filename !== '') {
        return this.deleteUploadedFilebyFilename_v2(filename, destination);
      } else {
        return {
          returnCode: '404',
          message: 'No such file or directory!',
        };
      }
    }
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.VIEW, Subject.ABNORMAL_MANAGEMENT) ||
      ability.can(Action.REMOVE, Subject.ABNORMAL_MANAGEMENT) ||
      ability.can(Action.VIEW, Subject.MAINTENANCE_STAFF) ||
      ability.can(Action.REMOVE, Subject.MAINTENANCE_STAFF) ||
      ability.can(Action.VIEW, Subject.INDOOR) ||
      ability.can(Action.REMOVE, Subject.INDOOR) ||
      ability.can(Action.VIEW, Subject.DEVICE) ||
      ability.can(Action.REMOVE, Subject.DEVICE),
  )
  //@Public()
  @Delete('fileName/:filename')
  @ApiCreatedResponse({
    description: 'deleteFilebyFilename',
  })
  async deleteUploadedFilebyFilename(
    @CurrentUser() user: User,
    @Param('filename') filename: string,
  ) {
    //因為函式中沒有使用groupId, 所以理論上應該不用再次檢查groupId, 故停用以下程式碼片段
    /*
    const groupId = user !== undefined ? user.groups[0].group.id : '';
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    */
    const destinationtemp =
      await this.imageMgmtService.getDestinationbyfilename(filename);
    const destination = destinationtemp || UPLOAD_DIRECTORY_URL;
    const filePath = String().concat(destination, '\\', filename);

    let response: BasicResponseType;
    try {
      const fileName = { filename: filename };

      fs.unlinkSync(filePath);
      if (await this.imageMgmtService.deleteImagesbyFilename(fileName)) {
        response = {
          returnCode: '200',
          message: 'File removed successfully!',
        };
      } else {
        response = {
          returnCode: '400',
          message: 'Failed to remove file! (Database Error)',
        };
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('no such file or directory')) {
          response = {
            returnCode: '404',
            message: 'No such file or directory!',
          };
        } else {
          response = {
            returnCode: '400',
            message: 'Failed to remove file!',
          };
        }
      } else {
        response = {
          returnCode: '400',
          message: 'Failed to remove file!',
        };
      }
    }
    return response;
  }

  async deleteUploadedFilebyFilename_v2(
    filename: string,
    destinationtemp: string,
  ) {
    const destination = destinationtemp || UPLOAD_DIRECTORY_URL;
    const filePath = String().concat(destination, '\\', filename);

    let response: BasicResponseType;
    try {
      const fileName = { filename: filename };

      fs.unlinkSync(filePath);
      if (await this.imageMgmtService.deleteImagesbyFilename(fileName)) {
        response = {
          returnCode: '200',
          message: 'File removed successfully!',
        };
      } else {
        response = {
          returnCode: '400',
          message: 'Failed to remove file! (Database Error)',
        };
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('no such file or directory')) {
          response = {
            returnCode: '404',
            message: 'No such file or directory!',
          };
        } else {
          response = {
            returnCode: '400',
            message: 'Failed to remove file!',
          };
        }
      } else {
        response = {
          returnCode: '400',
          message: 'Failed to remove file!',
        };
      }
    }
    return response;
  }

  async deleteUploadedFilebyFilename_v3(
    filename: string,
    destinationtemp: string,
  ) {
    const destination = destinationtemp || UPLOAD_DIRECTORY_URL;
    const filePath = String().concat(destination, '\\', filename);

    let response: BasicResponseType;
    try {
      const fileName = { filename: filename };

      fs.unlinkSync(filePath);
      if (await this.imageMgmtService.deleteImagesbyFilename(fileName)) {
        response = {
          returnCode: '200',
          message: 'File removed successfully!',
        };
      } else {
        response = {
          returnCode: '400',
          message: String().concat(
            'Failed to remove file! (Database Error)',
            '=> filename =',
            filename,
          ),
        };
      }
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('no such file or directory')) {
          response = {
            returnCode: '404',
            message: String().concat(
              'No such file or directory! ',
              '=> filename =',
              filename,
            ),
          };
        } else {
          response = {
            returnCode: '400',
            message: String().concat(
              'Failed to remove file! ',
              '=> filename =',
              filename,
            ),
          };
        }
      } else {
        response = {
          returnCode: '400',
          message: String().concat(
            'Failed to remove file! ',
            '=> filename =',
            filename,
          ),
        };
      }
    }
    return response;
  }

  checkUserGroupIds(user: User): boolean {
    let groupId = '';
    let i: number;
    let userpermission = false;

    if (user !== undefined) {
      for (i = 0; i < user.groups.length; i++) {
        groupId = user.groups[i].group.id;

        if (
          this.groupService.isGroupUnder(user, groupId) as unknown as boolean
        ) {
          userpermission = true;
          break;
        }
      }
    }
    return userpermission;
  }

  @Post('uploadFileToWifiPlus')
  @ApiCreatedResponse({
    description: 'uploadedFile',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      // storage: diskStorage({
      //   //destination: './files',
      //   destination: UPLOAD_DIRECTORY_URL,
      //   filename: editFileName,
      // }),
      storage: memoryStorage(),
      // limits: {
      //   fileSize: MAX_FILE_SIZE,
      // },
      //fileFilter: imageFileFilter,
    }),
  )
  @ApiConsumes('multipart/form-data')
  async uploadFileToWifiPlus(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<string> {
    // const groupId = user !== undefined ? user.groups[0].group.id : '';
    // // permission check: 'groupId' must under user's current division
    // if (!(await this.groupService.isGroupUnder(user, groupId))) {
    //   throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    // }
    return this.imageMgmtService.uploadFile(file);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.ADD, Subject.ESIGNAGE) ||
      ability.can(Action.MODIFY, Subject.ESIGNAGE),
  )
  //@Public()
  @Post('uploadedMedia')
  @ApiCreatedResponse({
    description: 'uploadedMedia',
  })
  @UseInterceptors(
    FileInterceptor('media', {
      storage: diskStorage({
        //destination: './files',
        destination: UPLOAD_DIRECTORY_URL,
        filename: editFileName,
      }),
      limits: {
        fileSize: MAX_FILE_SIZE2,
      },
      fileFilter: imageFileFilter2,
    }),
  )
  @ApiConsumes('multipart/form-data')
  async uploadedMedia(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadedFileType> {
    const fileInfoList: FileInfoType[] = [];
    const fileInfo = {
      destination: file.destination,
      fieldname: file.fieldname,
      filename: file.filename,
      mimetype: file.mimetype,
      originalname: file.originalname,
      path: file.path,
      size: file.size,
    };

    fileInfoList.push(fileInfo);

    const insertedRes: object = await this.imageMgmtService.addImages(
      fileInfoList,
    );

    if (insertedRes !== undefined && insertedRes !== null) {
      const response: UploadedFileType = {
        returnCode: '200',
        message: 'File uploaded successfully!',
        fileInfo: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          _id: insertedRes[0]?._id || null,
          fieldname: file.fieldname,
          filename: file.filename,
          mimetype: file.mimetype,
          originalname: file.originalname,
          //path: file.path,
          size: file.size,
        },
      };
      return response;
    } else {
      const response: UploadedFileType = {
        returnCode: '400',
        message: 'File uploaded failure! (DB Error)',
        fileInfo: null,
      };
      return response;
    }
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions(
    (ability: AppAbility) =>
      ability.can(Action.ADD, Subject.ESIGNAGE) ||
      ability.can(Action.MODIFY, Subject.ESIGNAGE),
  )
  //@Public()
  @Post('multiple2')
  @ApiCreatedResponse({
    description: 'uploadMedia2',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('media', 100, {
      storage: diskStorage({
        //destination: '../../files',
        destination: UPLOAD_DIRECTORY_URL,
        filename: editFileName,
      }),
      limits: {
        fileSize: MAX_FILE_SIZE2,
      },
      fileFilter: imageFileFilter2,
    }),
  )
  async uploadMedia2(
    @CurrentUser() user: User,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ): Promise<UploadMultipleFilesType> {
    const fileInfoList: FileInfoType[] = [];

    files.forEach((file: Express.Multer.File) => {
      const fileReponse = {
        destination: file.destination,
        fieldname: file.fieldname,
        filename: file.filename,
        mimetype: file.mimetype,
        originalname: file.originalname,
        path: file.path,
        size: file.size,
      };
      fileInfoList.push(fileReponse);
    });
    const insertedRes: object = await this.imageMgmtService.addImages(
      fileInfoList,
    );
    if (insertedRes !== undefined && insertedRes !== null) {
      const fileInfoListWithObjectId: FileInfoTypeWithObjectId[] = [];
      let i: number;

      for (i = 0; i < fileInfoList.length; i++) {
        const fileInfoWithObjectId = {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          _id: insertedRes[i]?._id || null,
          fieldname: fileInfoList[i].fieldname,
          filename: fileInfoList[i].filename,
          mimetype: fileInfoList[i].mimetype,
          originalname: fileInfoList[i].originalname,
          //path: fileInfoList[i].path,
          size: fileInfoList[i].size,
        };
        fileInfoListWithObjectId.push(fileInfoWithObjectId);
      }
      const response: UploadMultipleFilesType = {
        returnCode: '200',
        message: 'File uploaded successfully!',
        fileInfoList: fileInfoListWithObjectId,
      };
      return response;
    } else {
      const response: UploadMultipleFilesType = {
        returnCode: '400',
        message: 'Files uploaded failure! (DB Error)',
        fileInfoList: null,
      };
      return response;
    }
  }
}
