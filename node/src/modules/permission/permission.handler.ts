import { SetMetadata } from '@nestjs/common';
import { Constants } from 'src/constants';
import { AppAbility } from './ability.factory';

interface IPermissionHandler {
  handle(ability: AppAbility): boolean;
}

type PermissionHandlerCallback = (ability: AppAbility) => boolean;

export type PermissionHandler = IPermissionHandler | PermissionHandlerCallback;

export const CheckPermissions = (...handlers: PermissionHandler[]) =>
  SetMetadata(Constants.KEY_CHECK_PERMISSIONS, handlers);
