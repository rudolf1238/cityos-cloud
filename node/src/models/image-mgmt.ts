import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, ObjectId } from 'mongoose';
import { Document } from 'mongoose';

export class BasicResponseType {
  returnCode: string;

  message: string;
}

export const BasicResponseTypeSchema =
  SchemaFactory.createForClass(BasicResponseType);

export class FileInfoType {
  destination: string;

  fieldname: string;

  filename: string;

  mimetype: string;

  originalname: string;

  path: string;

  size: number;
}

export const FileInfoTypeSchema = SchemaFactory.createForClass(FileInfoType);

export class FileInfoTypeWithObjectId {
  _id: ObjectId;

  fieldname: string;

  filename: string;

  mimetype: string;

  originalname: string;

  //path: string;

  size: number;
}

export const FileInfoTypeWithObjectIdSchema = SchemaFactory.createForClass(
  FileInfoTypeWithObjectId,
);

export class UploadedFileType extends BasicResponseType {
  fileInfo: FileInfoTypeWithObjectId;
}

export const UploadedFileTypeSchema =
  SchemaFactory.createForClass(UploadedFileType);

export class UploadMultipleFilesType extends BasicResponseType {
  fileInfoList: FileInfoTypeWithObjectId[];
}

export const UploadMultipleFilesTypeSchema = SchemaFactory.createForClass(
  UploadMultipleFilesType,
);

@Schema({ timestamps: true })
//@index({ location: '2dsphere' })
export class UploadImage {
  _id!: Types.ObjectId;

  id: string;

  @Prop()
  path: string;

  @Prop()
  mimeType: string;

  @Prop()
  description: string;

  @Prop()
  destination: string;

  @Prop()
  fieldname: string;

  @Prop()
  originalname: string;

  @Prop()
  size: number;

  @Prop()
  filename: string;
}

export type UploadImageDocument = UploadImage & Document;
export const UploadImageSchema = SchemaFactory.createForClass(UploadImage);
