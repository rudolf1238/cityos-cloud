import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { WifihotspotService } from './wifihotspot.service';
import { GroupService } from '../group/group.service';
import { forwardRef, Inject, UseGuards } from '@nestjs/common';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { AppAbility } from '../permission/ability.factory';
import {
  Action,
  DetailCompanyAdvance,
  ResponseWIFI,
  Subject,
  WifiFilter,
  ResponseAREA,
  AreaFilter,
  DetailArea,
  AdFilter,
  ResponseAdList,
  DetailAd,
  AddWifiAdInput,
  EditWifiAdInput,
} from 'src/graphql.schema';
import { CurrentUser } from '../auth/auth.decorator';
import { User } from 'src/models/user';
import { ForbiddenError } from 'apollo-server-express';
import { Log, UserEvent } from 'src/models/log';
import { LogService } from '../log/log.service';

@Resolver('WifiHotspot')
export class WifihotspotResolver {
  constructor(
    private readonly wifihotspotService: WifihotspotService,
    @Inject(forwardRef(() => GroupService))
    private readonly groupService: GroupService,
    private logService: LogService,
  ) {}

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.WIFI),
  )
  @Query('searchCompanys')
  async searchCompanys(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('email') email: string,
    @Args('currentPage') currentPage: number,
    @Args('pageCount') pageCount: number,
    @Args('filter') filter?: WifiFilter,
  ): Promise<ResponseWIFI> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    return this.wifihotspotService.getDivisionwithUser(
      groupId,
      email,
      currentPage,
      pageCount,
      filter,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.WIFI),
  )
  @Query('searchCompanyAdvance')
  async searchCompanyAdvance(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('companyId') companyId: string,
  ): Promise<DetailCompanyAdvance> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    return this.wifihotspotService.searchCompanyAdvance(companyId);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.WIFI),
  )
  @Query('getAreaList')
  async getAreaList(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('companyId') companyId: string,
    @Args('currentPage') currentPage: number,
    @Args('pageCount') pageCount: number,
    @Args('filter') filter: AreaFilter,
  ): Promise<ResponseAREA> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(
        `getAreaList:You have no permission to visit ${groupId}.`,
      );
    }
    return this.wifihotspotService.getAreaList(
      companyId,
      currentPage,
      pageCount,
      filter,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.WIFI),
  )
  @Query('getArea')
  async getArea(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('companyId') companyId: string,
    @Args('areaId') areaId: string,
  ): Promise<DetailArea> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(
        `getArea:You have no permission to visit ${groupId}.`,
      );
    }
    return this.wifihotspotService.getArea(companyId, areaId);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.WIFI),
  )
  @Query('getAdList')
  async getAdList(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('companyId') companyId: string,
    @Args('currentPage') currentPage: number,
    @Args('pageCount') pageCount: number,
    @Args('filter') filter: AdFilter,
  ): Promise<ResponseAdList> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(
        `getAdList:You have no permission to visit ${groupId}.`,
      );
    }
    return this.wifihotspotService.getAdList(
      companyId,
      currentPage,
      pageCount,
      filter,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.WIFI),
  )
  @Query('getAd')
  async getAd(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('companyId') companyId: string,
    @Args('id') id: string,
  ): Promise<DetailAd> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(
        `getAd:You have no permission to visit ${groupId}.`,
      );
    }

    const ad = await this.wifihotspotService.getAd(companyId, id);
    const detailAd: DetailAd = new DetailAd();
    detailAd.node = ad;

    return detailAd;
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.ADD, Subject.WIFI),
  )
  @Mutation('addCompany')
  async addCompany(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('divisionId') divisionId: string,
    @Args('name') name: string,
    @Args('logo') logo: string,
    @Args('line') line: string,
    @Args('url') url: string,
    @Args('ssid') ssid: string,
    @Args('serviceIntroduction') serviceIntroduction: string,
    @Args('serviceIntroductionEn') serviceIntroductionEn: string,
    @Args('accessTime') accessTime: number,
    @Args('dailyAccess') dailyAccess: number,
    @Args('accessLimit') accessLimit: number,
    @Args('idleTimeout') idleTimeout: number,
    @Args('terms') terms: string,
    @Args('termsEn') termsEn: string,
    @Args('privacyTerms') privacyTerms: string,
    @Args('privacyTermsEn') privacyTermsEn: string,
    @Args('downloadSpeed') downloadSpeed: number,
    @Args('uploadSpeed') uploadSpeed: number,
    @Args('passShowTime') passShowTime: number,
  ): Promise<string> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    return this.wifihotspotService.addCompany(
      divisionId,
      name,
      logo,
      line,
      url,
      ssid,
      serviceIntroduction,
      serviceIntroductionEn,
      accessTime,
      dailyAccess,
      accessLimit,
      idleTimeout,
      terms,
      termsEn,
      privacyTerms,
      privacyTermsEn,
      downloadSpeed,
      uploadSpeed,
      passShowTime,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.REMOVE, Subject.WIFI),
  )
  @Mutation('deleteCompany')
  async deleteCompany(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('divisionId') divisionId: string,
  ): Promise<string[]> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    return this.wifihotspotService.deleteCompany(divisionId);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.MODIFY, Subject.WIFI),
  )
  @Mutation('editCompany')
  async editCompany(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('divisionId') divisionId: string,
    @Args('name') name: string,
    @Args('logo') logo: string,
    //@Args('logo', { type: () => GraphQLUpload }) file: FileUpload,
    @Args('line') line: string,
    @Args('url') url: string,
    @Args('ssid') ssid: string,
    @Args('serviceIntroduction') serviceIntroduction: string,
    @Args('serviceIntroductionEn') serviceIntroductionEn: string,
    @Args('accessTime') accessTime: number,
    @Args('dailyAccess') dailyAccess: number,
    @Args('accessLimit') accessLimit: number,
    @Args('idleTimeout') idleTimeout: number,
    @Args('terms') terms: string,
    @Args('termsEn') termsEn: string,
    @Args('privacyTerms') privacyTerms: string,
    @Args('privacyTermsEn') privacyTermsEn: string,
    @Args('downloadSpeed') downloadSpeed: number,
    @Args('uploadSpeed') uploadSpeed: number,
    @Args('passShowTime') passShowTime: number,
  ): Promise<string> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    return this.wifihotspotService.editCompany(
      divisionId,
      name,
      logo,
      line,
      url,
      ssid,
      serviceIntroduction,
      serviceIntroductionEn,
      accessTime,
      dailyAccess,
      accessLimit,
      idleTimeout,
      terms,
      termsEn,
      privacyTerms,
      privacyTermsEn,
      downloadSpeed,
      uploadSpeed,
      passShowTime,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.REMOVE, Subject.WIFI),
  )
  @Mutation('deleteArea')
  async deleteArea(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('companyId') companyId: string,
    @Args('areaId') areaId: string,
  ): Promise<string[]> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    // log
    const areaIds: string[] = [];
    areaIds.push(areaId);
    const log = new Log(user, UserEvent.REMOVE_WIFI_AREA, groupId, areaIds);
    await this.logService.insertEvent(log);

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return [];
    return this.wifihotspotService.deleteArea(companyId, areaId);
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.ADD, Subject.WIFI),
  )
  @Mutation('addArea')
  async addArea(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('companyId') companyId: string,
    @Args('areaName') areaName: string,
    @Args('serviceStartDate') serviceStartDate: string,
    @Args('serviceEndDate') serviceEndDate: string,
  ): Promise<string> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    // log
    const areaNames: string[] = [];
    areaNames.push(areaName);
    const log = new Log(user, UserEvent.ADD_WIFI_AREA, groupId, areaNames);
    await this.logService.insertEvent(log);

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return '';

    const result = await this.wifihotspotService.addArea(
      companyId,
      areaName,
      serviceStartDate,
      serviceEndDate,
    );

    return result;
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.MODIFY, Subject.WIFI),
  )
  @Mutation('editArea')
  async editArea(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('companyId') companyId: string,
    @Args('areaId') areaId: string,
    @Args('areaName') areaName: string,
    @Args('serviceStartDate') serviceStartDate: string,
    @Args('serviceEndDate') serviceEndDate: string,
  ): Promise<string> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    // log
    const areaIds: string[] = [];
    areaIds.push(areaId);
    const log = new Log(user, UserEvent.MODIFY_WIFI_AREA, groupId, areaIds);
    await this.logService.insertEvent(log);

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return '';

    const result = await this.wifihotspotService.editArea(
      companyId,
      areaId,
      areaName,
      serviceStartDate,
      serviceEndDate,
    );

    if (result === true) {
      return areaId;
    } else {
      return '';
    }
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.ADD, Subject.WIFI),
  )
  @Mutation('addAd')
  async addAd(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('companyId') companyId: string,
    @Args('wifiAdInput') wifiAdInput: AddWifiAdInput,
  ): Promise<string> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    // log
    const adNames: string[] = [];
    adNames.push(wifiAdInput.name);
    const log = new Log(user, UserEvent.ADD_WIFI_AD, groupId, adNames);
    await this.logService.insertEvent(log);

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return '';

    const result = await this.wifihotspotService.addAd(companyId, wifiAdInput);

    return result;
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.MODIFY, Subject.WIFI),
  )
  @Mutation('editAd')
  async editAd(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('companyId') companyId: string,
    @Args('wifiAdInput') wifiAdInput: EditWifiAdInput,
  ): Promise<string> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    // log
    const adNames: string[] = [];
    adNames.push(wifiAdInput.editWifiAdInput.name);
    const log = new Log(user, UserEvent.MODIFY_WIFI_AD, groupId, adNames);
    await this.logService.insertEvent(log);

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return '';

    const result = await this.wifihotspotService.editAd(companyId, wifiAdInput);
    if (result) {
      return wifiAdInput.id;
    } else {
      return '';
    }
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.REMOVE, Subject.WIFI),
  )
  @Mutation('deleteAd')
  async deleteAd(
    @CurrentUser() user: User,
    @Args('groupId') groupId: string,
    @Args('companyId') companyId: string,
    @Args('id') id: string,
  ): Promise<string[]> {
    if (!(await this.groupService.isGroupUnder(user, groupId))) {
      throw new ForbiddenError(`You have no permission to visit ${groupId}.`);
    }
    // log
    const Ids: string[] = [];
    Ids.push(id);
    const log = new Log(user, UserEvent.REMOVE_WIFI_AD, groupId, Ids);
    await this.logService.insertEvent(log);

    const { projectKey } = await this.groupService.getGroup(groupId);
    if (projectKey === null) return [];
    return this.wifihotspotService.deleteAd(companyId, id);
  }
}
