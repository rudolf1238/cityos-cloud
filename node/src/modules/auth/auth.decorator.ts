/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { HttpAuthGuard } from './http-auth.guard';

export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext) => {
    const { user } = HttpAuthGuard.executionContextToRequest(context);
    return user.userModel;
  },
);

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
