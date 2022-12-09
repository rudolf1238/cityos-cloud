/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Constants } from 'src/constants';
import { AppAbility, AbilityFactory } from './ability.factory';
import { PermissionHandler } from './permission.handler';
import { HttpAuthGuard } from '../auth/http-auth.guard';
import { User } from 'src/models/user';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private abilityFactory: AbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionHandlers =
      this.reflector.get<PermissionHandler[]>(
        Constants.KEY_CHECK_PERMISSIONS,
        context.getHandler(),
      ) || [];

    const { user } = HttpAuthGuard.executionContextToRequest(context);
    const ability = await this.abilityFactory.createForUser(
      user.userModel as User,
    );

    return permissionHandlers.every((handler) =>
      this.execPermissionHandler(handler, ability),
    );
  }

  private execPermissionHandler(
    handler: PermissionHandler,
    ability: AppAbility,
  ) {
    if (typeof handler === 'function') {
      return handler(ability);
    }
    return handler.handle(ability);
  }
}
