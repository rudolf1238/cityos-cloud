import { UseGuards } from '@nestjs/common';
import { Resolver, Args, Query, ResolveField, Mutation } from '@nestjs/graphql';
import { ForbiddenError, ApolloError } from 'apollo-server-express';
import { Types } from 'mongoose';
import {
  Action,
  ActionType,
  AuditLogConnection,
  AuditLogFilter,
  AutomationAction,
  CreateRuleInput,
  DeviceAction,
  EditRuleInput,
  NotifyAction,
  RuleAutomation,
  RuleConnection,
  RuleFilter,
  RuleSubscription,
  Subject,
  SubscriptionConnection,
  SubscriptionFilter,
} from 'src/graphql.schema';
import { ErrorCode } from 'src/models/error.code';
import { User } from 'src/models/user';
import { CurrentUser } from '../auth/auth.decorator';
import { GroupService } from '../group/group.service';
import { AppAbility } from '../permission/ability.factory';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { AutomationService } from './automation.service';

@Resolver('Automation')
export class AutomationResolver {
  constructor(
    private readonly groupService: GroupService,
    private readonly automationService: AutomationService,
  ) {}

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.AUTOMATION_RULE_MANAGEMENT),
  )
  @Query()
  async searchRules(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('filter') filter?: RuleFilter,
    @Args('size') size?: number,
    @Args('after') after?: string,
    @Args('before') before?: string,
  ): Promise<RuleConnection> {
    // permission check: 'groupId' must under user's current division
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }

    if (after && before) {
      throw new ApolloError(
        'You can not provide the after and before at the same time.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }

    return this.automationService.searchRules(
      groupId,
      filter,
      size,
      after,
      before,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.ADD, Subject.AUTOMATION_RULE_MANAGEMENT),
  )
  @Mutation()
  async createRule(
    @CurrentUser() user: User,
    @Args('createRuleInput') createRuleInput: CreateRuleInput,
  ): Promise<RuleAutomation> {
    // permission check: 'groupId' must under user's current division
    if (
      !(await this.groupService.isGroupUnder(user, createRuleInput.groupId))
    ) {
      throw new ForbiddenError(
        `You have no permission to visit ${createRuleInput.groupId}.`,
      );
    }

    return (
      await this.automationService.createRule(createRuleInput)
    ).toApolloRuleAutomation();
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.REMOVE, Subject.AUTOMATION_RULE_MANAGEMENT),
  )
  @Mutation()
  async deleteRule(
    @CurrentUser() user: User,
    @Args('ruleId') ruleId: string,
  ): Promise<boolean> {
    // permission check: rules's 'groupId' must under user's current division
    try {
      const rule = await this.automationService.getRuleById(ruleId);
      if (!(await this.groupService.isGroupUnder(user, rule?.group.id))) {
        throw new ForbiddenError(`You have no permission to delete this rule.`);
      }
      return await this.automationService.deleteRule(rule);
    } catch (error) {
      throw new ForbiddenError(`You have no permission to delete this rule.`);
    }
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.MODIFY, Subject.AUTOMATION_RULE_MANAGEMENT),
  )
  @Mutation()
  async editRule(
    @CurrentUser() user: User,
    @Args('ruleId') ruleId: string,
    @Args('editRuleInput') editRuleInput: EditRuleInput,
  ): Promise<RuleAutomation> {
    // permission check: rules's 'groupId' must under user's current division
    const rule = await this.automationService.getRuleById(ruleId).catch((_) => {
      throw new ForbiddenError(`You have no permission to edit this rule.`);
    });
    if (!(await this.groupService.isGroupUnder(user, rule?.group.id))) {
      throw new ForbiddenError(`You have no permission to edit this rule.`);
    }

    return (
      await this.automationService.editRule(rule, editRuleInput)
    ).toApolloRuleAutomation();
  }

  @Query()
  async searchMySubscriptions(
    @CurrentUser() user: User,
    @Args('filter') filter?: SubscriptionFilter,
    @Args('size') size?: number,
    @Args('after') after?: string,
    @Args('before') before?: string,
  ): Promise<SubscriptionConnection> {
    if (after && before) {
      throw new ApolloError(
        'You can not provide the after and before at the same time.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }
    if (after) {
      try {
        new Types.ObjectId(after);
      } catch {
        throw new ApolloError(
          'The after you provided is not correct.',
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      }
    }
    if (before) {
      try {
        new Types.ObjectId(before);
      } catch {
        throw new ApolloError(
          'The before you provided is not correct.',
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      }
    }

    return this.automationService.searchMySubscriptions(
      user,
      filter,
      size,
      after,
      before,
    );
  }

  @UseGuards(PermissionGuard)
  @Mutation()
  async editMySubscription(
    @CurrentUser() user: User,
    @Args('ruleId') ruleId: string,
    @Args('byLine') byLine: boolean,
    @Args('byMail') byMail: boolean,
  ): Promise<RuleSubscription> {
    const subscription = await this.automationService.editMySubscription(
      user,
      ruleId,
      byLine,
      byMail,
    );
    if (!subscription) {
      throw new ForbiddenError(
        `You have no permission to edit this subscription.`,
      );
    }
    return subscription.toApolloRuleSubscription();
  }

  @Query()
  async searchAuditLogs(
    @CurrentUser() user: User,
    @Args('filter') filter?: AuditLogFilter,
    @Args('size') size?: number,
    @Args('after') after?: string,
    @Args('before') before?: string,
  ): Promise<AuditLogConnection> {
    if (after && before) {
      throw new ApolloError(
        'You can not provide the after and before at the same time.',
        ErrorCode.INPUT_PARAMETERS_INVALID,
      );
    }
    if (after) {
      try {
        new Types.ObjectId(after);
      } catch {
        throw new ApolloError(
          'The after you provided is not correct.',
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      }
    }
    if (before) {
      try {
        new Types.ObjectId(before);
      } catch {
        throw new ApolloError(
          'The before you provided is not correct.',
          ErrorCode.INPUT_PARAMETERS_INVALID,
        );
      }
    }

    return this.automationService.searchAuditLogs(
      user,
      filter,
      size,
      after,
      before,
    );
  }
}

@Resolver('AutomationAction')
export class AutomationActionResolver {
  @ResolveField()
  __resolveType(obj: AutomationAction) {
    switch (obj.actionType) {
      case ActionType.DEVICE: {
        return DeviceAction.name;
      }
      case ActionType.NOTIFY: {
        return NotifyAction.name;
      }
    }
  }
}
