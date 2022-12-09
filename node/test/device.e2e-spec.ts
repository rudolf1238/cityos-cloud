import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Device, GeoJSON } from 'src/models/device';
import { DeviceType } from 'src/graphql.schema';
import axios from 'axios';
import { AppModule } from '../src/app.module';

jest.setTimeout(60000);
describe('DeviceResolver (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let iotDevice: Device;
  const groupId = '60dc06c2e3a94b0afbed054c'; // 台北市政府

  beforeAll(async (done) => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // create the device in the CHT IOT
    const options = {
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json',
        CK: 'PK9KB2K4FGXMT39Z9G',
      },
    };
    const data = {
      name: '測試電桿',
      desc: '用來作為 CityOS Server End to End 測試之資料，請勿刪除以免E2E Testing發生錯誤。',
      type: 'general',
      lon: 121.61293,
      lat: 25.058693,
      attributes: [{ key: 'device_type', value: 'streetlight' }],
    };
    axios
      .post('https://iot.cht.com.tw/iot/v1/device', data, options)
      .then((res) => {
        console.log('add device to CHT IOT completed');
        console.log(res.data);
      })
      .catch((error) => {
        done.fail(new Error(`add device to CHT IOT: ${error}`));
      });

    // get the accessToken
    return request(app.getHttpServer())
      .post('/BwfFpQEqwq-cityosGraphQL')
      .send({
        variables: {
          loginInput: {
            email: 'developer@noodoe.com',
            password: '12345678',
          },
        },
        query: `mutation login($loginInput: LoginInput!) {
            login(loginInput: $loginInput) {
              accessToken
            }
          }`,
      })
      .expect(({ body }) => {
        accessToken = body.data.login.accessToken;
        console.log(`[login] ${accessToken}`);
        done();
      })
      .expect(200);
  });

  it('should read devices from CHT IOT by devicesFromIOT correctly', () => {
    return request(app.getHttpServer())
      .post('/BwfFpQEqwq-cityosGraphQL')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        variables: {
          groupId,
          name: '測試電桿',
        },
        query: `query devicesFromIOT($groupId: ID!, $type: DeviceType, $name: String, $desc: String) {
            devicesFromIOT(groupId: $groupId, type: $type, name: $name, desc: $desc) {
              name
              desc
              deviceId
              type
              location {
                lat
                lng
              }
            }
          }`,
      })
      .expect(({ body }) => {
        const device = body.data.devicesFromIOT[0];
        console.log(`[devicesFromIOT] ${JSON.stringify(device)}`);
        iotDevice = new Device();
        iotDevice.deviceId = device.deviceId;
        iotDevice.name = device.name;
        iotDevice.desc = device.desc;
        iotDevice.type = DeviceType[device.type];

        const geoJson = new GeoJSON();
        geoJson.coordinates = [device.location.lng, device.location.lat];
        iotDevice.location = geoJson;
      })
      .expect(200);
  });

  it('should add device to CityOS by addDevices correctly', () => {
    return request(app.getHttpServer())
      .post('/BwfFpQEqwq-cityosGraphQL')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        variables: {
          groupId,
          deviceIds: [iotDevice.deviceId],
        },
        query: `mutation addDevices($groupId:ID!, $deviceIds: [String!]!) {
            addDevices(groupId: $groupId, deviceIds: $deviceIds)
          }`,
      })
      .expect(({ body }) => {
        console.log(`[addDevices] ${JSON.stringify(body)}`);
        expect(body.data.addDevices).toEqual(true);
      })
      .expect(200);
  });

  it('should get device from CityOS by getDevice correctly', () => {
    return request(app.getHttpServer())
      .post('/BwfFpQEqwq-cityosGraphQL')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        variables: {
          deviceIds: [iotDevice.deviceId],
        },
        query: `query getDevices($deviceIds: [String!]!) {
            getDevices(deviceIds: $deviceIds) {
              deviceId
              name
              desc
              type
              location {
                lat
                lng
              }
              timezone {
                rawOffset
                timeZoneId
                timeZoneName
              }
            }
          }`,
      })
      .expect(({ body }) => {
        console.log(`[getDevices] ${JSON.stringify(body)}`);
        expect(body.data.getDevices[0].deviceId).toEqual(iotDevice.deviceId);
        expect(body.data.getDevices[0].name).toEqual(iotDevice.name);
        expect(body.data.getDevices[0].desc).toEqual(iotDevice.desc);
        expect(body.data.getDevices[0].type).toEqual(iotDevice.type.toString());
        expect(body.data.getDevices[0].location.lng).toEqual(
          iotDevice.location.coordinates[0],
        );
        expect(body.data.getDevices[0].location.lat).toEqual(
          iotDevice.location.coordinates[1],
        );
        expect(body.data.getDevices[0].timezone.rawOffset).toEqual(28800);
        expect(body.data.getDevices[0].timezone.timeZoneId).toEqual(
          'Asia/Taipei',
        );
        expect(body.data.getDevices[0].timezone.timeZoneName).toEqual(
          'Taipei Standard Time',
        );
      })
      .expect(200);
  });

  it('should delete device from CityOS by deteleDevices correctly', () => {
    return request(app.getHttpServer())
      .post('/BwfFpQEqwq-cityosGraphQL')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        variables: {
          groupId,
          deviceIds: [iotDevice.deviceId],
        },
        query: `mutation deleteDevices($groupId:ID!, $deviceIds: [String!]!) {
            deleteDevices(groupId: $groupId, deviceIds: $deviceIds)
          }`,
      })
      .expect(({ body }) => {
        console.log(`[deleteDevices] ${JSON.stringify(body)}`);
        expect(body.data.deleteDevices[0]).toEqual(iotDevice.deviceId);
      })
      .expect(200);
  });

  it('should get empty array from CityOS by getDevice cause the device is deleted', () => {
    return request(app.getHttpServer())
      .post('/BwfFpQEqwq-cityosGraphQL')
      .set('authorization', `Bearer ${accessToken}`)
      .send({
        variables: {
          deviceIds: [iotDevice.deviceId],
        },
        query: `query getDevices($deviceIds: [String!]!) {
            getDevices(deviceIds: $deviceIds) {
              deviceId
              name
            }
          }`,
      })
      .expect(({ body }) => {
        console.log(`[getDevices] ${JSON.stringify(body)}`);
        expect(body.data.getDevices).toEqual([]);
      })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});
