import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { UserService } from '../user/user.service';
import {
  ResponseWIFI,
  Group,
  Detaildivision,
  PageInfo,
  WifiFilter,
  DetailCompanyAdvance,
  CompanyAdvance,
  ResponseAREA,
  DetailArea,
  Area,
  AreaFilter,
  AdFilter,
  ResponseAdList,
  AdList,
  SimpleAd,
  AddWifiAdInput,
  EditWifiAdInput,
  AreaTable,
  Ad,
} from 'src/graphql.schema';
import { InjectModel } from '@nestjs/mongoose';
// import { Types } from 'mongoose';
import { ApolloError } from 'apollo-server-express';
import { Group as GroupModel } from 'src/models/group';
import { ConfigService } from '@nestjs/config';
import { ChtwifiplusClientService } from '../chtwifiplus-client/chtwifiplus-client.service';
import { WifihotspotRepository, DivisionCount } from './wifihotspot.repository';
import { Model } from 'mongoose';

//import {EnterpriseSettingReponse}from '../chtwifiplus-client/chtwifiplus-client.service';
@Injectable()
export class WifihotspotService {
  private readonly logger = new Logger(WifihotspotService.name);

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private chtwifiplusClientService: ChtwifiplusClientService,
    // @InjectModel(User)
    // private readonly userModel: ReturnModelType<typeof User>,
    @InjectModel(GroupModel.name)
    private readonly groupModel: Model<GroupModel>,
    private wifihotspotRepository: WifihotspotRepository,
  ) {}

  async getDivisionwithUser(
    groupId: string,
    email: string,
    currentPage: number,
    pageCount: number,
    filter?: WifiFilter,
  ): Promise<ResponseWIFI> {
    const user = await this.userService.findUser(email);
    if (user && user.id) {
      const divisions: Group[] =
        await this.wifihotspotRepository.getDivisionwithUser(
          groupId,
          user.id,
          currentPage,
          pageCount,
          filter,
        );

      const divisionCount: DivisionCount[] =
        await this.wifihotspotRepository.getDivisionCount(
          groupId,
          user.id,
          filter,
        );

      const grouplist: Group[] = divisions;
      const response = new ResponseWIFI();

      const division = grouplist.map((group) => {
        const nodes = new Detaildivision();
        nodes.node = group;
        return nodes;
      });
      response.divisions = division;
      response.totalCount =
        divisionCount.length !== 0 && divisionCount[0]
          ? divisionCount[0].divisionCount
          : 0;
      const pageInfo = new PageInfo();
      pageInfo.hasPreviousPage = !(currentPage === 1);
      pageInfo.hasNextPage = currentPage * pageCount < response.totalCount;
      pageInfo.beforeCursor = division[0] ? division[0].node.id : undefined;
      pageInfo.endCursor =
        division && division[0]
          ? division[division.length - 1].node.id
          : undefined;
      response.pageInfo = pageInfo;
      return response;
    } else {
      throw new ApolloError(
        `Cannot find - ${email} in the users collection.`,
        '400',
      );
    }
    // const divisionid: Group[] = [];
    // for (const group of user.groups) {
    //   const device = await this.deviceModel
    //     .find({ groups: group.group.id, type: 'WIFI' })
    //     .populate({ path: 'groups', model: Group })
    //     .populate({ path: 'sensors', model: Sensor });
    //   if (device.length > 0) {
    //     divisionid.push(group.group.toApolloGroup());
    //   }
    // }
    // divisionid.sort();
  }

  async searchCompanyAdvance(companyId: string): Promise<DetailCompanyAdvance> {
    const getEnterprise =
      await this.chtwifiplusClientService.getEnterpriseSetting(
        parseInt(companyId),
      );
    const response = new CompanyAdvance();
    if (getEnterprise && getEnterprise.code === '0000') {
      response.ssid = getEnterprise.enterprise_setting.ssid;
      response.serviceIntroduction =
        getEnterprise.enterprise_setting.service_introduction;
      response.serviceIntroductionEn =
        getEnterprise.enterprise_setting.service_introduction_en;
      response.accessTime = getEnterprise.enterprise_setting.access_time;
      response.dailyAccess = getEnterprise.enterprise_setting.daily_access;
      response.accessLimit = getEnterprise.enterprise_setting.access_limit;
      response.idleTimeout = getEnterprise.enterprise_setting.idle_timeout;
      response.terms = getEnterprise.enterprise_setting.terms;
      response.termsEn = getEnterprise.enterprise_setting.terms_en;
      response.privacyTerms = getEnterprise.enterprise_setting.privacy_terms;
      response.privacyTermsEn =
        getEnterprise.enterprise_setting.privacy_terms_en;
      response.downloadSpeed =
        getEnterprise.enterprise_setting.download_speed / 1024 / 1024;
      response.uploadSpeed =
        getEnterprise.enterprise_setting.upload_speed / 1024 / 1024;
      response.passShowTime = getEnterprise.enterprise_setting.pass_show_time;
    }
    const detailCompanyAdvance = new DetailCompanyAdvance();
    detailCompanyAdvance.node = response;
    return detailCompanyAdvance;
  }

  async addCompany(
    divisionId: string,
    name: string,
    logo: string,
    line: string,
    url: string,
    ssid: string,
    serviceIntroduction: string,
    serviceIntroductionEn: string,
    accessTime: number,
    dailyAccess: number,
    accessLimit: number,
    idleTimeout: number,
    terms: string,
    termsEn: string,
    privacyTerms: string,
    privacyTermsEn: string,
    downloadSpeed: number,
    uploadSpeed: number,
    passShowTime: number,
  ): Promise<string> {
    const createCompanyId = await this.chtwifiplusClientService.createAreaOwner(
      name,
      logo,
      line,
      url,
    );
    let errmessage = '';
    if (createCompanyId && createCompanyId.message) {
      errmessage = `with error = ${createCompanyId.message}`;
    }
    if (
      createCompanyId &&
      createCompanyId.area_owner &&
      createCompanyId.area_owner.id &&
      createCompanyId.code === '0000'
    ) {
      const setEnterprise =
        await this.chtwifiplusClientService.setEnterpriseSetting(
          createCompanyId.area_owner.id,
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
          downloadSpeed * 1024 * 1024,
          uploadSpeed * 1024 * 1024,
          passShowTime,
        );
      if (setEnterprise && setEnterprise.message) {
        errmessage = `with error = ${setEnterprise.message}`;
      }
      if (setEnterprise && setEnterprise.code === '0000') {
        //Set EnterpriseSetting success
        const groupupdate: GroupModel =
          await this.wifihotspotRepository.updategroup(
            divisionId,
            createCompanyId.area_owner,
          );
        if (
          groupupdate &&
          createCompanyId.area_owner.id &&
          groupupdate.companyId === createCompanyId.area_owner.id.toString()
        ) {
          //update companyId into groups collection success
          //return groupupdate.toApolloGroup();
          return createCompanyId.area_owner.id.toString();
        } else {
          //update companyId into groups collection fail
          const deleteAreaOwner =
            await this.chtwifiplusClientService.deleteAreaOwner(
              createCompanyId.area_owner.id,
            );
          if (deleteAreaOwner.code !== '0000') {
            this.logger.log(
              `(City OS) Update groups companyId - ${createCompanyId.area_owner.id} Fail and (Wifi Plus) deleteAreaOwner Fail.`,
            );
          } else {
            this.logger.log(
              `(City OS) Update groups companyId - ${createCompanyId.area_owner.id} Fail.`,
            );
          }
          throw new ApolloError(
            `AddCompany- ${name} Fail, CityOS update groups Fail`,
            '400',
          );
        }
      } else {
        //Set EnterpriseSetting fail
        const deleteAreaOwner =
          await this.chtwifiplusClientService.deleteAreaOwner(
            createCompanyId.area_owner.id,
          );
        if (deleteAreaOwner.code !== '0000') {
          //deleteAreaOwner fail
          this.logger.log(
            `(Wifi Plus) SetEnterpriseSetting AreaOwner-${createCompanyId.area_owner.id} Fail ${errmessage}and (Wifi Plus) deleteAreaOwner-${createCompanyId.area_owner.id} Fail`,
          );
        } else {
          this.logger.log(
            `(Wifi Plus) SetEnterpriseSetting AreaOwner-${createCompanyId.area_owner.id} Fail ${errmessage}`,
          );
        }
        throw new ApolloError(
          `AddCompany- ${name} Fail, Wifi plus Set enterprise setting Fail ${errmessage}`,
          '400',
        );
      }
    } else {
      throw new ApolloError(
        `AddCompany- ${name} Fail, Wifi plus Create area owner Fail ${errmessage}`,
        '400',
      );
    }
  }

  async deleteCompany(divisionId: string): Promise<string[]> {
    const groups: GroupModel = await this.wifihotspotRepository.getdivision(
      divisionId,
    );
    const deletable: string[] = [];
    if (groups && groups.companyId) {
      const getAreaOwner = await this.chtwifiplusClientService.getAreaOwner(
        parseInt(groups.companyId),
      );
      let errmessage = '';
      if (getAreaOwner && getAreaOwner.message) {
        errmessage = `with error = ${getAreaOwner.message}`;
      }
      if (getAreaOwner && getAreaOwner.code === '0000') {
        const deleteAreaOwner =
          await this.chtwifiplusClientService.deleteAreaOwner(
            parseInt(groups.companyId),
          );
        if (deleteAreaOwner && deleteAreaOwner.message) {
          errmessage = `with error = ${deleteAreaOwner.message}`;
        }
        if (deleteAreaOwner.code !== '0000') {
          throw new ApolloError(
            `DeleteCompany Fail, Delete AreaOwner -${getAreaOwner.area_owner.id}in WIFI PLUS Fail ${errmessage}.`,
            '400',
          );
        } else {
          const groupupdate: GroupModel =
            await this.wifihotspotRepository.deletegroup(divisionId);

          if (!groupupdate.companyId) {
            // return groupupdate.toApolloGroup();
            deletable.push(groupupdate.id.toString());
            return deletable;
          } else {
            throw new ApolloError(
              `DeleteCompany Fail, Delete groups companyId - ${groups.companyId} in City OS Fail.`,
              '400',
            );
          }
        }
      } else {
        if (
          getAreaOwner &&
          getAreaOwner.status &&
          getAreaOwner.status.indexOf('OBJECT_NOT_FOUND') !== -1
        ) {
          const groupupdate: GroupModel =
            await this.wifihotspotRepository.deletegroup(divisionId);
          if (!groupupdate.companyId) {
            // return groupupdate.toApolloGroup();
            deletable.push(groupupdate.id.toString());
            return deletable;
          } else {
            throw new ApolloError(
              `DeleteCompany Fail, Delete groups companyId - ${groups.companyId} in City OS Fail.`,
              '400',
            );
          }
        } else {
          throw new ApolloError(
            `DeleteCompany Fail,getAreaOwner - ${groups.companyId} in Wifi Plus Fail ${errmessage}.`,
            '400',
          );
        }
      }
    } else {
      throw new ApolloError(`Cannot find divisionId-${divisionId}`, '400');
    }
  }

  async editCompany(
    divisionId: string,
    name: string,
    logo: string,
    line: string,
    url: string,
    ssid: string,
    serviceIntroduction: string,
    serviceIntroductionEn: string,
    accessTime: number,
    dailyAccess: number,
    accessLimit: number,
    idleTimeout: number,
    terms: string,
    termsEn: string,
    privacyTerms: string,
    privacyTermsEn: string,
    downloadSpeed: number,
    uploadSpeed: number,
    passShowTime: number,
  ): Promise<string> {
    const groups: GroupModel = await this.wifihotspotRepository.getdivision(
      divisionId,
    );
    if (groups && groups.companyId) {
      const updateCompany = await this.chtwifiplusClientService.updateAreaOwner(
        groups.companyId,
        name,
        logo,
        line,
        url,
      );
      let errmessage = '';
      if (updateCompany && updateCompany.message) {
        errmessage = `with error = ${updateCompany.message}`;
      }
      if (
        updateCompany &&
        updateCompany.area_owner &&
        updateCompany.area_owner.id &&
        updateCompany.code === '0000'
      ) {
        const groupupdate: GroupModel =
          await this.wifihotspotRepository.updategroupforupdate(
            divisionId,
            updateCompany.area_owner,
          );
        if (
          groupupdate &&
          groupupdate.companyId === updateCompany.area_owner.id.toString() &&
          groupupdate.name === updateCompany.area_owner.name &&
          groupupdate.logo === updateCompany.area_owner.logo &&
          groupupdate.line === updateCompany.area_owner.line &&
          groupupdate.url === updateCompany.area_owner.url
        ) {
          //update companyId into groups collection success
          //return groupupdate.toApolloGroup();
          const setEnterprise =
            await this.chtwifiplusClientService.setEnterpriseSetting(
              parseInt(groups.companyId),
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
              downloadSpeed * 1024 * 1024,
              uploadSpeed * 1024 * 1024,
              passShowTime,
            );
          if (setEnterprise && setEnterprise.message) {
            errmessage = `with error = ${setEnterprise.message}`;
          }
          if (setEnterprise && setEnterprise.code === '0000') {
            return groupupdate.id;
          } else {
            //update companyId into groups collection fail
            throw new ApolloError(
              `EditCompany Fail,setEnterpriseSetting companyId - ${groups.companyId} in Wifi Plus Fail ${errmessage}.`,
              '400',
            );
          }
        } else {
          //update companyId into groups collection fail
          const rollbackAreaOwner =
            await this.chtwifiplusClientService.updateAreaOwner(
              groups.companyId,
              groups.name,
              groups.logo,
              groups.line,
              groups.url,
            );
          if (rollbackAreaOwner && rollbackAreaOwner.message) {
            errmessage = `with error = ${rollbackAreaOwner.message}`;
          }
          if (
            rollbackAreaOwner &&
            rollbackAreaOwner.area_owner &&
            rollbackAreaOwner.area_owner.id &&
            rollbackAreaOwner.code === '0000'
          ) {
            //rollback area_owner success
            throw new ApolloError(
              `EditCompany Fail,Update groups companyId - ${groups.companyId} in City OS Fail.`,
              '400',
            );
          } else {
            throw new ApolloError(
              `EditCompany Fail,Update groups companyId - ${groups.companyId} in City OS Fail and Rollback Area_owner in Wifi Plus Fail ${errmessage}.`,
              '400',
            );
          }
        }
      } else {
        throw new ApolloError(
          `EditCompany Fail,update area_ownerId - ${groups.companyId} in Wifi Plus Fail ${errmessage}.`,
          '400',
        );
      }
    } else {
      throw new ApolloError(`Cannot find divisionId-${divisionId}`, '400');
    }
  }

  async getAreaList(
    companyId: string,
    currentPage: number,
    pageCount: number,
    filter?: AreaFilter,
  ): Promise<ResponseAREA> {
    const getAreaList = await this.chtwifiplusClientService.getAreaList(
      parseInt(companyId),
      currentPage,
      pageCount,
      filter,
    );

    const reponseArea: ResponseAREA = new ResponseAREA();
    if (getAreaList && getAreaList.code === '0000' && getAreaList.areas) {
      const areas = getAreaList.areas.map((area) => {
        const nodes = new DetailArea();
        const area1: Area = {
          ...area,
          serviceStartDate: area.start_datetime_memo,
          serviceEndDate: area.end_datetime_memo,
        };
        nodes.node = area1;
        return nodes;
      });
      reponseArea.areas = areas;
      reponseArea.totalCount = getAreaList.total_count;

      const pageInfo = new PageInfo();
      pageInfo.hasPreviousPage = !(currentPage === 1);
      pageInfo.hasNextPage = currentPage * pageCount < reponseArea.totalCount;
      reponseArea.pageInfo = pageInfo;
      return reponseArea;
    } else {
      throw new ApolloError(`Cannot find area list in -${companyId}`, '400');
    }
  }

  async getArea(companyId: string, areaId: string): Promise<DetailArea> {
    const companyid = parseInt(companyId);
    const areaid = parseInt(areaId);

    const getArea = await this.chtwifiplusClientService.getArea(
      companyid,
      areaid,
    );

    const reponseArea = new Area();
    const reponseDetailArea = new DetailArea();
    if (getArea && getArea.code === '0000' && getArea.area) {
      reponseArea.id = getArea.area.id.toString();
      reponseArea.name = getArea.area.name;
      reponseArea.serviceEndDate = getArea.area.end_datetime_memo
        ? getArea.area.end_datetime_memo
        : '';
      reponseArea.serviceStartDate = getArea.area.start_datetime_memo
        ? getArea.area.start_datetime_memo
        : '';
      reponseDetailArea.node = reponseArea;
      return reponseDetailArea;
    } else {
      throw new ApolloError(
        `Cannot find area -${areaId} in companyId -${companyId}`,
        '400',
      );
    }
  }

  async deleteArea(companyId: string, areaId: string): Promise<string[]> {
    const deletable: string[] = [];
    const deleteArea = await this.chtwifiplusClientService.deleteArea(
      parseInt(companyId),
      parseInt(areaId),
    );

    if (deleteArea) {
      deletable.push(areaId);
    }

    return deletable;
  }

  async addArea(
    companyId: string,
    areaName: string,
    serviceStartDate: string,
    serviceEndDate?: string,
  ): Promise<string> {
    const addArea = await this.chtwifiplusClientService.createArea(
      companyId,
      areaName,
      serviceStartDate,
      serviceEndDate,
    );
    return addArea;
  }

  async editArea(
    companyId: string,
    areaId: string,
    areaName: string,
    serviceStartDate: string,
    serviceEndDate?: string,
  ): Promise<boolean> {
    const editArea = await this.chtwifiplusClientService.updateArea(
      companyId,
      areaId,
      areaName,
      serviceStartDate,
      serviceEndDate,
    );
    return editArea;
  }

  async getAdList(
    companyId: string,
    currentPage: number,
    pageCount: number,
    filter?: AdFilter,
  ): Promise<ResponseAdList> {
    const getAdList = await this.chtwifiplusClientService.getAdList(
      parseInt(companyId),
      currentPage,
      pageCount,
      filter,
    );

    const reponseAdList: ResponseAdList = new ResponseAdList();

    if (getAdList && getAdList.code === '0000' && getAdList.ad_internets) {
      const ads = getAdList.ad_internets.map((ad) => {
        const nodes = new AdList();
        const ad1: SimpleAd = { ...ad };

        nodes.node = ad1;
        return nodes;
      });

      reponseAdList.ads = ads;
      reponseAdList.totalCount = getAdList.total_count;

      const pageInfo = new PageInfo();
      pageInfo.hasPreviousPage = !(currentPage === 1);
      pageInfo.hasNextPage = currentPage * pageCount < reponseAdList.totalCount;
      reponseAdList.pageInfo = pageInfo;
      return reponseAdList;
    } else {
      throw new ApolloError(`Cannot find ad list in -${companyId}`, '400');
    }
  }

  async getAd(companyId: string, id: string): Promise<Ad> {
    const responseAd = await this.chtwifiplusClientService.getAd(
      parseInt(companyId),
      parseInt(id),
    );

    const responseAreaList = await this.chtwifiplusClientService.getAreaList(
      parseInt(companyId),
      1,
      10,
    );

    let newAreaList: AreaTable[] = [];
    // 如果 responseAd.ad_internet.area_list.length ==1，就要判斷這是不是一個 companyid，
    // 如果是，要取出旗下所有 area，並返回結果給 frontend
    if (responseAd.ad_internet.area_list.length == 1) {
      const responseAreaOwner =
        await this.chtwifiplusClientService.getAreaOwner(
          responseAd.ad_internet.area_list[0],
        );
      if (responseAreaOwner.code === '0000') {
        // 確定 area_list 內為companyid， 取出該 company下所有的 Area，並轉換為 AreaList Obj
        newAreaList = this.ChangeInt2Obj(
          this.TrimAreaList(responseAreaList.areas),
          responseAreaList.areas,
        );
      } else {
        newAreaList = this.ChangeInt2Obj(
          responseAd.ad_internet.area_list,
          responseAreaList.areas,
        );
      }
    } else {
      newAreaList = this.ChangeInt2Obj(
        responseAd.ad_internet.area_list,
        responseAreaList.areas,
      );
    }

    responseAd.ad_internet.area_list_obj = newAreaList;

    return responseAd.ad_internet;
  }

  ChangeInt2Obj(areaListInt: number[], areaListObj: Area[]): AreaTable[] {
    const arealist: AreaTable[] = [];
    let area1: AreaTable;
    for (let i = 0; i < areaListInt.length; i++) {
      for (let j = 0; j < areaListObj.length; j++) {
        if (areaListInt[i] === parseInt(areaListObj[j].id)) {
          area1 = {
            id: areaListObj[j].id,
            name: areaListObj[j].name,
          };
          arealist.push(area1);
        }
      }
    }

    return arealist;
  }

  TrimAreaList(areas: Area[]): number[] {
    const areaList: number[] = [];

    for (let i = 0; i < areas.length; i++) {
      areaList.push(parseInt(areas[i].id));
    }

    return areaList;
  }

  async addAd(companyId: string, wifiAdInput: AddWifiAdInput): Promise<string> {
    const addAd = await this.chtwifiplusClientService.createAd(
      companyId,
      wifiAdInput,
    );

    return addAd;
  }

  async editAd(
    companyId: string,
    wifiAdInput: EditWifiAdInput,
  ): Promise<boolean> {
    const editAd = await this.chtwifiplusClientService.editAd(
      companyId,
      wifiAdInput,
    );
    return editAd;
  }

  async deleteAd(companyId: string, id: string): Promise<string[]> {
    const deletable: string[] = [];
    const deleteAd = await this.chtwifiplusClientService.deleteAd(
      parseInt(companyId),
      parseInt(id),
    );

    if (deleteAd) deletable.push(id);

    return deletable;
  }
}
