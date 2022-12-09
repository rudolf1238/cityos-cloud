import { forwardRef, Module } from '@nestjs/common';
import { User, UserSchema } from 'src/models/user';
import {
  VerificationCode,
  VerificationCodeSchema,
} from 'src/models/verification.code';
import { UserService } from './user.service';
import { UserResolver } from './user.resolver';
import { GroupModule } from '../group/group.module';
import { AuthModule } from '../auth/auth.module';
import { PermissionModule } from '../permission/permission.module';
import { MailModule } from '../mail/mail.module';
import { LogModule } from '../log/log.module';
import { ImageMgmtModule } from '../image-mgmt/image-mgmt.module';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
        collection: 'users',
      },
      {
        name: VerificationCode.name,
        schema: VerificationCodeSchema,
        collection: 'verification_codes',
      },
    ]),
    forwardRef(() => GroupModule),
    forwardRef(() => AuthModule),
    ImageMgmtModule,
    PermissionModule,
    MailModule,
    LogModule,
  ],
  providers: [UserResolver, UserService],
  exports: [UserService],
})
export class UserModule {}
