/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './auth.decorator';

@Injectable()
export class HttpAuthGuard extends AuthGuard('bearer') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // true: the current request is allowed to proceed
      return true;
    }

    // remove this line will lead to error -> Cannot read property 'headers' of undefined
    if (context.getHandler().name === '__resolveType') {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err, user, _info): any {
    // You can throw an exception based onx either "info" or "err" arguments
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }

  getRequest(context: ExecutionContext): any {
    return HttpAuthGuard.executionContextToRequest(context);
  }

  static executionContextToRequest(context: ExecutionContext): any {
    if (context.getType() === 'http') {
      return context.switchToHttp().getRequest<Request>();
    } else if (context.getType<GqlContextType>() === 'graphql') {
      const ctx = GqlExecutionContext.create(context);
      const { req, connection } = ctx.getContext();
      return connection && connection.context && connection.context.headers
        ? connection.context
        : req;
    }
  }
}
