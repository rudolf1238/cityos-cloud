import { Args, Mutation, Resolver } from '@nestjs/graphql';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { EmergencyCallService } from './emergency-call.service';

import { forwardRef, Inject } from '@nestjs/common';
import { GroupService } from '../group/group.service';
import { CurrentUser } from '../auth/auth.decorator';
import { User } from 'oauth2-server';
import { EmergencyCallDb } from './emergency-call.repository';

@Resolver('EmergencyCall')
export class EmergencyCallResolver {
  constructor(
    private readonly emergencyCallService: EmergencyCallService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    private emergencyCallEventDb: EmergencyCallDb,
  ) {}

  @Mutation('addEmergencyCallEvent')
  async createEmergencyCallEvent(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    // @Args('buildingInput') buildingInput: ,
  ): Promise<string> {
    console.log('createEmergencyCallEvent');
    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return 'PROJECTKEY NULL';

    //emergencyCallService.checkEmergencyCallInput

    // return this.emergencyCallService.createEmergencyCallEvent(
    //   user,
    //   groupId,
    //   projectKey,
    //   buildingInput,
    // );
  }
}
