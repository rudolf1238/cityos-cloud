import { Ability } from '@casl/ability';
import { Injectable } from '@nestjs/common';
import { User } from 'src/models/user';
import { Action, Subject } from 'src/graphql.schema';

export type AppAbility = Ability<[Action, Subject]>;

@Injectable()
export class AbilityFactory {
  async createForUser(user: User) {
    const groupInfo = user.groups.find((gp) => gp.inUse);
    const ability = new Ability(
      groupInfo?.permission?.rules ? groupInfo.permission.rules : [],
    );
    return ability as AppAbility;
  }
}
