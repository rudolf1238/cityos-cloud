import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosResponse } from 'axios';
import { ConfigService } from '@nestjs/config';
import { ApolloError } from 'apollo-server-express';
import { ErrorCode } from 'src/models/error.code';
import FormData from 'form-data';
import {
  AreaFilter,
  AreaSortField,
  SortOrder,
  AdFilter,
  AdSortField,
  SimpleAd,
  AddWifiAdInput,
  EditWifiAdInput,
  Ad,
} from 'src/graphql.schema';

export interface AddCompanyReponse {
  code: string;
  status: string;
  area_owner?: AddCompanyAreaOwner;
  message?: string;
}
export interface AddCompanyAreaOwner {
  id: number;
  name: string;
  logo: string;
  line: string;
  url: string;
}
export interface EnterpriseSettingReponse {
  code: string;
  status: string;
  message?: string;
  enterprise_setting?: SetEnterpriseSetting;
}
interface SetEnterpriseSetting {
  ssid: string;
  service_introduction: string;
  service_introduction_en: string;
  access_time: number;
  daily_access: number;
  access_limit: number;
  idle_timeout: number;
  terms: string;
  terms_en: string;
  privacy_terms: string;
  privacy_terms_en: string;
  download_speed: number;
  upload_speed: number;
  pass_show_time: number;
}

interface DeleteCompanyReponse {
  code: string;
  status: string;
  message: string;
}

interface WifiplusErrReponse {
  code: string;
  status: string;
  message: string;
}

interface AddAreaReponse {
  code: string;
  status: string;
  area: Area;
}

interface AddAdResponse {
  code: string;
  status: string;
  ad_internet: Ad;
}

export interface Upload {
  code: string;
  status: string;
  message?: string;
  name?: string;
}

export interface GetAreaListReponse {
  code: string;
  status: string;
  message: string;
  total_count?: number;
  areas?: Area[];
}

export interface GetAreaReponse {
  code: string;
  status: string;
  message?: string;
  area?: Area;
}

interface Area {
  id: string;
  name: string;
  start_datetime_memo: string;
  end_datetime_memo: string;
}

export interface AreaList {
  areas: Area[];
}

export interface GetAdListReponse {
  code: string;
  status: string;
  message: string;
  total_count?: number;
  ad_internets?: SimpleAd[];
}

export interface GetAdResponse {
  code: string;
  status: string;
  message?: string;
  ad_internet?: Ad;
}

@Injectable()
export class ChtwifiplusClientService {
  private apiUrl: string;

  private apiKey: string;

  private apiVersion: string;

  private readonly logger = new Logger(ChtwifiplusClientService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.apiUrl = this.configService.get<string>('WIFIPLUS_API_PATH');
    this.apiKey = this.configService.get<string>('WIFIPLUS_API_KEY');
    this.apiVersion = this.configService.get<string>('WIFIPLUS_API_VERSION');
  }

  async createAreaOwner(
    name: string,
    logo: string,
    line: string,
    url: string,
  ): Promise<AddCompanyReponse> {
    const data = {
      name: name,
      logo: logo,
      line: line,
      url: url,
    };
    //log
    this.logger.log(
      `CreateAreaOwner: ${this.apiUrl}/cms_api/${this.apiVersion}/${
        this.apiKey
      }/area_owners \n${JSON.stringify(data)}`,
    );

    const response = await this.httpService
      .post(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners`,
        data,
      )
      .toPromise()
      .then((res: AxiosResponse<AddCompanyReponse>) => res.data)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `(Wifi Plus) Create area_owner - ${name} in WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `(Wifi Plus) Create area_owner - ${name} in WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_API_ERROR,
        // );
        return error.response.data;
      });

    return response;
  }

  async setEnterpriseSetting(
    companyId: number,
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
  ): Promise<EnterpriseSettingReponse> {
    const data = {
      ssid: ssid,
      service_introduction: serviceIntroduction,
      service_introduction_en: serviceIntroductionEn,
      access_time: accessTime,
      daily_access: dailyAccess,
      access_limit: accessLimit,
      idle_timeout: idleTimeout,
      terms: terms,
      terms_en: termsEn,
      privacy_terms: privacyTerms,
      privacy_terms_en: privacyTermsEn,
      download_speed: downloadSpeed,
      upload_speed: uploadSpeed,
      pass_show_time: passShowTime,
    };
    //log
    this.logger.log(
      `SetEnterpriseSetting: ${this.apiUrl}/cms_api/${this.apiVersion}/${
        this.apiKey
      }/area_owners/${companyId.toString()} \n${JSON.stringify(
        data,
      )}/enterprise_setting`,
    );

    const response = await this.httpService
      .put(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/enterprise_setting`,
        data,
      )
      .toPromise()
      .then((res: AxiosResponse<EnterpriseSettingReponse>) => res.data)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `(Wifi Plus) Set EnterpriseSetting area_ownerId - ${companyId} in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `(Wifi Plus) Set EnterpriseSetting area_ownerId - ${companyId} in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_API_ERROR,
        // );
        return error.response.data;
      });

    return response;
  }

  async getAreaOwner(companyId: number): Promise<AddCompanyReponse> {
    //log
    this.logger.log(
      `GetAreaOwner: ${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}`,
    );

    const response = await this.httpService
      .get(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}`,
      )
      .toPromise()
      .then((res: AxiosResponse<AddCompanyReponse>) => res.data)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `(Wifi Plus) Get area_ownerId- ${companyId} in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `(Wifi Plus) Get area_ownerId- ${companyId} in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_API_ERROR,
        // );

        return error.response?.data;
      });
    return response;
  }

  async getEnterpriseSetting(
    companyId: number,
  ): Promise<EnterpriseSettingReponse> {
    //log
    this.logger.log(
      `getEnterpriseSetting: ${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/enterprise_setting`,
    );

    const response = await this.httpService
      .get(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/enterprise_setting`,
      )
      .toPromise()
      .then((res: AxiosResponse<EnterpriseSettingReponse>) => res.data)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `(Wifi Plus) Get EnterpriseSetting area_ownerId - ${companyId} in the WIFI PLUS failed with error = ${error.message}.`,
        );

        throw new ApolloError(
          `(Wifi Plus) Get EnterpriseSetting area_ownerId - ${companyId} in the WIFI PLUS failed with error = ${error.message}.`,
          ErrorCode.CHTWIFIPLUS_API_ERROR,
        );
      });
    return response;
  }

  async deleteAreaOwner(companyId: number): Promise<DeleteCompanyReponse> {
    //log
    this.logger.log(
      `DeleteAreaOwner: ${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}`,
    );

    const response = await this.httpService
      .delete(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}`,
      )
      .toPromise()
      .then((res: AxiosResponse<DeleteCompanyReponse>) => res.data)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `(Wifi Plus) Delete area_ownerId- ${companyId} in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `(Wifi Plus) Delete area_ownerId- ${companyId} in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_API_ERROR,
        // );
        return error.response?.data;
      });
    return response;
  }

  async updateAreaOwner(
    companyId: string,
    name: string,
    logo: string,
    line: string,
    url: string,
  ): Promise<AddCompanyReponse> {
    const data = {
      name,
      logo,
      line,
      url,
    };
    //log
    this.logger.log(
      `UpdateAreaOwner: ${this.apiUrl}/cms_api/${this.apiVersion}/${
        this.apiKey
      }/area_owners/${companyId} \n${JSON.stringify(data)}`,
    );

    const response = await this.httpService
      .put(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}`,
        data,
      )
      .toPromise()
      .then((res: AxiosResponse<AddCompanyReponse>) => res.data)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `Update area_ownerId- ${companyId} in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `Update area_ownerId- ${companyId} in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_API_ERROR,
        // );
        return error.response?.data;
      });

    return response;
  }

  async uploadFile(file: Express.Multer.File): Promise<Upload> {
    //log
    this.logger.log(
      `uploads: ${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/uploads`,
    );
    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname,
    });

    const response = await this.httpService
      .post(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/uploads`,
        formData,
        {
          headers: formData.getHeaders(),
        },
      )
      //.pipe(map((resp) => resp.data))
      .toPromise()
      .then((res: AxiosResponse<Upload>) => res.data)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `(Wifi Plus) uploadFile- in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `(Wifi Plus) uploadFile in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_API_ERROR,
        // );
        return error.response?.data;
      });
    return response;
  }

  async getAreaList(
    companyId: number,
    currentPage: number,
    pageCount: number,
    filter?: AreaFilter,
  ): Promise<GetAreaListReponse> {
    //log
    this.logger.log(
      `GetAreaList: ${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/areas?fields=id,name,start_datetime_memo,end_datetime_memo`,
    );

    const sortField = filter?.sortField ? filter.sortField : AreaSortField.ID;
    const keyword = filter?.keyword ? filter.keyword : '';
    //const sortOrder = filter?.sortOrder ? Object.keys(filter.sortOrder) : 'ASC';

    const sortOrder = filter?.sortOrder
      ? filter.sortOrder
      : SortOrder.ASCENDING;

    let sortFields: string;
    let sortOrders: string;

    switch (sortField) {
      case AreaSortField.ID:
        sortFields = 'id';
        if (sortOrder === SortOrder.ASCENDING) {
          sortOrders = 'ASC';
        } else {
          sortOrders = 'DESC';
        }
        break;
      case AreaSortField.NAME:
        sortFields = 'name';
        if (sortOrder === SortOrder.ASCENDING) {
          sortOrders = 'ASC';
        } else {
          sortOrders = 'DESC';
        }
        break;
      case AreaSortField.SERVICESTARTDATE:
        sortFields = 'start_datetime_memo';
        if (sortOrder === SortOrder.ASCENDING) {
          sortOrders = 'ASC';
        } else {
          sortOrders = 'DESC';
        }
        break;
      case AreaSortField.SERVICEENDDATE:
        sortFields = 'end_datetime_memo';
        if (sortOrder === SortOrder.ASCENDING) {
          sortOrders = 'ASC';
        } else {
          sortOrders = 'DESC';
        }
        break;
    }
    let strPageCount = '';
    if (pageCount) {
      strPageCount = `&page_size=${pageCount}`;
    }
    const response = await this.httpService
      .get(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${
          this.apiKey
        }/area_owners/${companyId}/areas?fields=id,name,start_datetime_memo,end_datetime_memo&keyword=${encodeURIComponent(
          keyword,
        )}&sort=${sortFields}:${sortOrders}${strPageCount}&page_number=${currentPage}`,
      )
      .toPromise()
      .then((res: AxiosResponse<GetAreaListReponse>) => res.data)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `(Wifi Plus) Get area_list- ${companyId} in WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `(Wifi Plus) Get area_list- ${companyId} in WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_API_ERROR,
        // );
        return error.response.data;
      });
    return response;
  }

  async getArea(companyId: number, areaId: number): Promise<GetAreaReponse> {
    //log
    this.logger.log(
      `GetArea: ${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/areas/${areaId}`,
    );

    const response = await this.httpService
      .get(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/areas/${areaId}`,
      )
      .toPromise()
      .then((res: AxiosResponse<GetAreaReponse>) => res.data)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `Get area- ${companyId} (${areaId}) in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `Get area- ${companyId} (${areaId}) in the WIFI PLUS failed with error = ${error.message}.`,
        //   ErrorCode.CHTWIFIPLUS_API_ERROR,
        // );
        return error.response.data;
      });

    return response;
  }

  async deleteArea(companyId: number, areaId: number): Promise<boolean> {
    //log
    this.logger.log(
      `DeleteArea: ${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/areas/${areaId}`,
    );

    return !!(await this.httpService
      .delete(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/areas/${areaId}`,
      )
      .toPromise()
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `Delete area- ${companyId}  (${areaId}) in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        throw new ApolloError(
          `Delete area- ${companyId}  (${areaId}) in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
          ErrorCode.CHTWIFIPLUS_ADD_AREA_API_ERROR,
        );
      }));
  }

  async createArea(
    companyId: string,
    areaName: string,
    serviceStartDate: string,
    serviceEndDate: string,
  ): Promise<string> {
    const data = {
      name: areaName,
      start_datetime_memo: serviceStartDate,
      end_datetime_memo: serviceEndDate,
    };
    //log
    this.logger.log(
      `UpdateArea: ${this.apiUrl}/cms_api/${this.apiVersion}/${
        this.apiKey
      }/area_owners/${companyId}/areas\n${JSON.stringify(data)}`,
    );

    const response = await this.httpService
      .post(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/areas`,
        data,
      )
      .toPromise()
      .then((res: AxiosResponse<AddAreaReponse>) => res.data.area.id)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `Update area- ${companyId} in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `Update area- ${companyId} in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_ADD_AREA_API_ERROR,
        // );
        return '';
      });

    return response;
  }

  async updateArea(
    companyId: string,
    areaId: string,
    areaName: string,
    serviceStartDate: string,
    serviceEndDate: string,
  ): Promise<boolean> {
    const data = {
      name: areaName,
      start_datetime_memo: serviceStartDate,
      end_datetime_memo: serviceEndDate,
    };
    //log
    this.logger.log(
      `UpdateArea: ${this.apiUrl}/cms_api/${this.apiVersion}/${
        this.apiKey
      }/area_owners/${companyId}/areas/${areaId} \n${JSON.stringify(data)}`,
    );

    return !!(await this.httpService
      .put(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/areas/${areaId}`,
        data,
      )
      .toPromise()
      .then((res: AxiosResponse<AddAreaReponse>) => res.data)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `Update area- ${companyId}  (${areaId})  in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        throw new ApolloError(
          `Update area- ${companyId}  (${areaId}) in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
          ErrorCode.CHTWIFIPLUS_UPDATE_AREA_API_ERROR,
        );
      }));
  }

  async getAdList(
    companyId: number,
    currentPage: number,
    pageCount: number,
    filter?: AdFilter,
  ): Promise<GetAdListReponse> {
    //log
    this.logger.log(
      `GetAdList: ${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/ad_internets?fields=id,name,company_name,image,youtube_video_id,area_list`,
    );

    const sortField = filter?.sortField ? filter.sortField : AdSortField.ID;
    const keyword = filter?.keyword ? filter.keyword : '';

    const sortOrder = filter?.sortOrder
      ? filter.sortOrder
      : SortOrder.ASCENDING;

    let sortFields: string;
    let sortOrders: string;

    switch (sortField) {
      case AdSortField.ID:
        sortFields = 'id';
        if (sortOrder === SortOrder.ASCENDING) {
          sortOrders = 'ASC';
        } else {
          sortOrders = 'DESC';
        }
        break;
      case AdSortField.NAME:
        sortFields = 'name';
        if (sortOrder === SortOrder.ASCENDING) {
          sortOrders = 'ASC';
        } else {
          sortOrders = 'DESC';
        }
        break;
    }

    const response = await this.httpService
      .get(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${
          this.apiKey
        }/area_owners/${companyId}/ad_internets?fields=id,name,type,company_name,image,youtube_video_id&keyword=${encodeURIComponent(
          keyword,
        )}&&sort=${sortFields}:${sortOrders}&page_size=${pageCount}&page_number=${currentPage}`,
      )
      .toPromise()
      .then((res: AxiosResponse<GetAdListReponse>) => res.data)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `(Wifi Plus) Get area_list- ${companyId} in WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `(Wifi Plus) Get ad_list- ${companyId} in WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_API_ERROR,
        // );
        return error.response.data;
      });
    return response;
  }

  async getAd(companyId: number, id: number): Promise<GetAdResponse> {
    //log
    this.logger.log(
      `GetAd: ${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/ad_internets/${id}`,
    );

    const response = await this.httpService
      .get(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/ad_internets/${id}`,
      )
      .toPromise()
      .then((res: AxiosResponse<GetAdResponse>) => res.data)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `(Wifi Plus) Get ad- ${id} in WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );
        // throw new ApolloError(
        //   `(Wifi Plus) Get ad- ${id} in WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_API_ERROR,
        // );
        return error.response.data;
      });

    return response;
  }

  async createAd(
    companyId: string,
    wifiAdInput: AddWifiAdInput,
  ): Promise<string> {
    const data: AddWifiAdInput = { ...wifiAdInput };
    // eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars
    const { click_qty, daily_click_qty, ...newData } = { ...wifiAdInput };

    //log
    this.logger.log(
      `AddAd: ${this.apiUrl}/cms_api/${this.apiVersion}/${
        this.apiKey
      }/area_owners/${companyId}/ad_internets\n${JSON.stringify(
        wifiAdInput.pricing_type === 0 ? newData : data,
      )}`,
    );

    const response = await this.httpService
      .post(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/ad_internets`,
        wifiAdInput.pricing_type === 0 ? newData : data,
      )
      .toPromise()
      .then((res: AxiosResponse<AddAdResponse>) => res.data.ad_internet.id)
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `Create ad- ${companyId} in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `Add the advertisement ${companyId} failed with error ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_ADD_AD_API_ERROR,
        // );
        return '';
      });

    return response;
  }

  async editAd(
    companyId: string,
    wifiAdInput: EditWifiAdInput,
  ): Promise<boolean> {
    // const data: EditWifiAdInput = { ...wifiAdInput };
    const data = { ...wifiAdInput.editWifiAdInput };
    // eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars
    const { click_qty, daily_click_qty, ...newData } = {
      ...wifiAdInput.editWifiAdInput,
    };

    //log
    this.logger.log(
      `EditAd: ${this.apiUrl}/cms_api/${this.apiVersion}/${
        this.apiKey
      }/area_owners/${companyId}/ad_internets/${
        wifiAdInput.id
      }\n${JSON.stringify(
        wifiAdInput.editWifiAdInput.pricing_type === 0 ? newData : data,
      )}`,
    );

    return !!(await this.httpService
      .put(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/ad_internets/${wifiAdInput.id}`,
        wifiAdInput.editWifiAdInput.pricing_type === 0 ? newData : data,
      )
      .toPromise()
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `Edit the advertisement- ${companyId} (${wifiAdInput.id}) in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `Edit the advertisement ${companyId} (${wifiAdInput.id}) failed with error ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_EDIT_AD_API_ERROR,
        // );
      }));
  }

  async deleteAd(companyId: number, id: number): Promise<boolean> {
    //log
    this.logger.log(
      `DeleteAd: ${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/ad_internets/${id}`,
    );

    return !!(await this.httpService
      .delete(
        `${this.apiUrl}/cms_api/${this.apiVersion}/${this.apiKey}/area_owners/${companyId}/ad_internets/${id}`,
      )
      .toPromise()
      .catch((error: AxiosError<WifiplusErrReponse>) => {
        this.logger.error(
          `Delete ad- ${companyId} (${id}) in the WIFI PLUS failed with error = ${error.response?.data?.message}.`,
        );

        // throw new ApolloError(
        //   `Delete the advertisement ${companyId} (${id}) failed with error ${error.response?.data?.message}.`,
        //   ErrorCode.CHTWIFIPLUS_DELETE_AD_API_ERROR,
        // );
      }));
  }
}
