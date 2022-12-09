import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import { GPSPoint } from 'src/graphql.schema';
import { Address, AddressDetail, Timezone } from 'src/models/device';

interface TimeZoneResponse {
  dstOffset: number;
  rawOffset: number;
  status: string;
  timeZoneId: string;
  timeZoneName: string;
}

interface AddressComponentResponse {
  long_name: string;
  short_name: string;
  types: string[];
}

interface geometryResponse {
  location: locationResponse;
}

interface locationResponse {
  lat: number;
  lng: number;
}

interface AddressResultResponse {
  address_components: AddressComponentResponse[];
  formatted_address: string;
  geometry: geometryResponse;
}

interface AddressResponse {
  results: AddressResultResponse[];
  status: string;
}

@Injectable()
export class GoogleClientService {
  private apiUrl: string;

  private apiKey: string;

  private readonly logger = new Logger(GoogleClientService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.apiUrl = this.configService.get<string>('GOOGLE_SERVER_URI');
    this.apiKey = this.configService.get<string>('GOOGLE_SERVER_API_KEY');
  }

  async getTimeZone(lat: number, lng: number): Promise<Timezone> {
    this.logger.debug(
      `Get timezone with query: ${
        this.apiUrl
      }/timezone/json?location=${lat},${lng}&timestamp=${Math.floor(
        new Date().getTime() / 1000,
      )}`,
    );
    /** ***
     * The Google Time Zone Responses :
     * {
     *     "dstOffset" : 0,
     *     "rawOffset" : 28800,
     *     "status" : "OK",
     *     "timeZoneId" : "Asia/Taipei",
     *     "timeZoneName" : "Taipei Standard Time"
     * }
     */
    const response = await this.httpService
      .get(
        `${
          this.apiUrl
        }/timezone/json?location=${lat},${lng}&timestamp=${Math.floor(
          new Date().getTime() / 1000,
        )}&key=${this.apiKey}`,
      )
      .toPromise()
      .then((res: AxiosResponse<TimeZoneResponse>) => res.data);

    if (response.status === 'OK') {
      const timezone = new Timezone();
      timezone.rawOffset = response.rawOffset;
      timezone.timeZoneId = response.timeZoneId;
      timezone.timeZoneName = response.timeZoneName;
      return timezone;
    }
    return null;
  }

  // reference for language: https://developers.google.com/maps/faq#languagesupport
  async addressLookup(
    language: string,
    lat: number,
    lng: number,
  ): Promise<Address> {
    this.logger.debug(
      `AddressLookup with query: ${this.apiUrl}/geocode/json?latlng=${lat},${lng}&language=${language}&key=${this.apiKey}`,
    );
    /** ***
     * The Google AddressLookup Responses :
     * {
     *     "plus_code" : {
     *         "compound_code" : "3J57+G9 台灣台北市南港區",
     *         "global_code" : "7QQ33J57+G9"
     *     },
     *     "results" : [
     *         {
     *             "address_components" : [
     *                 { "long_name" : "台北市", "short_name" : "台北市", "types" : [ "administrative_area_level_1", "political" ] },
     *                 { "long_name" : "台灣", "short_name" : "TW", "types" : [ "country", "political" ] },
     *                 ...
     *             ],
     *             "formatted_address" : "115台灣台北市南港區19 之 11 號 4 樓",
     *             ...
     *         }
     *         ...
     *     ],
     *     "status" :  "OK" or "ZERO_RESULTS"
     * }
     */
    const response = await this.httpService
      .get(
        `${this.apiUrl}/geocode/json?latlng=${lat},${lng}&language=${language}&key=${this.apiKey}`,
      )
      .toPromise()
      .then((res: AxiosResponse<AddressResponse>) => res.data);

    console.log(response);
    if (response.status === 'OK') {
      const address = new Address();
      const addressDetail = new AddressDetail();

      const result = response.results[0];
      const components = result.address_components;
      components.forEach((it) => {
        if (it.types.includes('country')) {
          addressDetail.country = it.long_name;
        }
        if (
          it.types.includes('administrative_area_level_1') ||
          it.types.includes('administrative_area_level_2')
        ) {
          addressDetail.city = it.long_name;
        }
      });
      addressDetail.formattedAddress = result.formatted_address;
      address.language = language;
      address.detail = addressDetail;

      return address;
    }
    return null;
  }

  async getLatLonByAddress1(address: string): Promise<GPSPoint> {
    this.logger.debug(
      `getLatLonByAddress with query: ${this.apiUrl}/geocode/json?address=${address}&key=${this.apiKey}`,
    );

    const response = await this.httpService
      .get(
        `${this.apiUrl}/geocode/json?address=${encodeURI(address)}&key=${
          this.apiKey
        }`,
      )
      .toPromise()
      .then((res: AxiosResponse<AddressResponse>) => res.data);

    if (response.status === 'OK') {
      const gpspoint = new GPSPoint();
      const result = response.results[0];
      const components = result.geometry;

      gpspoint.lat = components.location.lat;
      gpspoint.lng = components.location.lng;

      return gpspoint;
    }
    return null;
  }
}
