import { /*forwardRef, Inject,*/ Injectable } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Model, ObjectId } from 'mongoose';
import { IsNotEmpty, IsOptional } from 'class-validator';
import { InjectModel } from '@nestjs/mongoose';
import {
  FileInfoType,
  UploadImage,
  UploadImageDocument,
} from '../../models/image-mgmt';
import { ConfigService } from '@nestjs/config';
// import { GroupService } from '../group/group.service';
import { ChtwifiplusClientService } from '../chtwifiplus-client/chtwifiplus-client.service';
export class ImageInfo {
  @ApiProperty()
  @IsNotEmpty()
  path: string;

  @ApiProperty()
  @IsNotEmpty()
  mimeType: string;

  @ApiProperty()
  @IsNotEmpty()
  destination: string;

  @ApiProperty()
  @IsNotEmpty()
  fieldname: string;

  @ApiProperty()
  @IsNotEmpty()
  filename: string;

  @ApiProperty()
  @IsNotEmpty()
  originalname: string;

  @ApiProperty()
  @IsNotEmpty()
  size: number;

  @ApiPropertyOptional()
  @IsOptional()
  description: string;
}

@Injectable()
export class ImageMgmtService {
  constructor(
    @InjectModel(UploadImage.name)
    private readonly UploadImageModel: Model<UploadImageDocument>,
    private configService: ConfigService, // @Inject(forwardRef(() => GroupService)) // private groupService: GroupService,
    private chtwifiplusClientService: ChtwifiplusClientService,
  ) {}

  async addImages(fileInfoList: FileInfoType[]): Promise<object> {
    try {
      const result: object = await this.UploadImageModel.insertMany(
        fileInfoList,
      );
      return result;
    } catch (err) {
      return null;
    }
  }

  async deleteImagesbyFilename(filename: {
    filename: string;
  }): Promise<boolean> {
    await this.UploadImageModel.deleteMany(filename);
    return true;
  }

  async getFilenamebyId(Id: { _id: ObjectId }): Promise<string> {
    const fileInfo = await this.UploadImageModel.findById(Id);
    const filename = fileInfo != undefined ? fileInfo.filename : '';
    return filename;
  }

  async getFilenameAndDestinationbyId(Id: {
    _id: ObjectId | string;
  }): Promise<{ filename: string; destination: string }> {
    const fileInfo = await this.UploadImageModel.findById(Id);
    const filename = fileInfo != undefined ? fileInfo.filename : '';
    const destination = fileInfo != undefined ? fileInfo.destination : '';
    const filenameDestination = {
      filename: filename,
      destination: destination,
    };
    return filenameDestination;
  }

  async getDestinationbyfilename(fileName: string): Promise<string> {
    const fileInfo = await this.UploadImageModel.findOne({
      filename: fileName,
    });
    const destination = fileInfo != undefined ? fileInfo.destination : '';
    return destination;
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    const groupupdate = await this.chtwifiplusClientService.uploadFile(file);
    if (groupupdate && groupupdate.name) {
      return groupupdate.name;
    } else {
      return null;
    }
  }
}
