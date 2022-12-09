/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpException, HttpStatus } from '@nestjs/common';
import { extname } from 'path';
import shortId from 'shortid';

type FileType = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
};

export const imageFileFilter = (
  req,
  file: FileType,
  callback: (error: Error, acceptFile: boolean) => void,
): void => {
  try {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|JPG|JPEG|PNG|GIF)$/)) {
      //return callback(new Error('Only image files are allowed!'), false);
      //BadRequestExcrption
      const msg = 'Only image files are allowed! (ex: *.jpg, *png, and *gif)';

      return callback(new HttpException(msg, HttpStatus.BAD_REQUEST), false);
    } else callback(null, true);
  } catch (err) {}
};

export const imageFileFilter2 = (
  req,
  file: FileType,
  callback: (error: Error, acceptFile: boolean) => void,
): void => {
  try {
    if (!file.originalname.match(/\.(jpg|jpeg|png|mp4|JPG|JPEG|PNG|MP4)$/)) {
      //return callback(new Error('Only image files are allowed!'), false);
      //BadRequestExcrption
      const msg =
        'Only image and video files are allowed! (ex: *.jpg, *png, and *mp4)';

      return callback(new HttpException(msg, HttpStatus.BAD_REQUEST), false);
    } else callback(null, true);
  } catch (err) {}
};

export const editFileName = (
  req,
  file: Express.Multer.File,
  callback: (error: Error, filename: string) => void,
) => {
  try {
    const name = file.originalname.split('.')[0];
    const fileExtName = extname(file.originalname);
    //eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-call
    const randomFileName = `${shortId.generate()}-${name}${fileExtName}`;
    callback(null, randomFileName);
  } catch (err) {}
};
