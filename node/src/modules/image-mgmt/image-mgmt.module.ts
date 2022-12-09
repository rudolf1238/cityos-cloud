import { forwardRef, Module } from '@nestjs/common';
import { ImageMgmtService } from './image-mgmt.service';
import { ImageMgmtController } from './image-mgmt.controller';
import { UploadImage, UploadImageSchema } from 'src/models/image-mgmt';
import { MongooseModule } from '@nestjs/mongoose';
import { LogModule } from '../log/log.module';
import { PermissionModule } from '../permission/permission.module';
import { GroupModule } from '../group/group.module';
import { UserModule } from '../user/user.module';
import { ChtwifiplusClientModule } from '../chtwifiplus-client/chtwifiplus-client.module';
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: UploadImage.name,
        schema: UploadImageSchema,
        collection: 'upload_images',
      },
    ]),
    forwardRef(() => GroupModule),
    forwardRef(() => UserModule),
    PermissionModule,
    LogModule,
    ChtwifiplusClientModule,
  ],
  // providers: [ImageMgmtController, ImageMgmtService],
  // exports: [ImageMgmtService],
  controllers: [ImageMgmtController],
  providers: [ImageMgmtService],
  exports: [ImageMgmtService],
})
export class ImageMgmtModule {}
