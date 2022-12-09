import { ESignageCMService } from './eSignageCM.service';
import { ESignageCMResolver } from './eSignageCM.resolver';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GoogleClientModule } from '../google-client/google-client/google-client.module';
import { PermissionModule } from '../permission/permission.module';
import { LogModule } from '../log/log.module';
import { HttpModule } from '@nestjs/axios';
import { GroupModule } from '../group/group.module';
import { UserModule } from '../user/user.module';
import { DeviceModule } from '../device/device.module';
import { ChtiotClientModule } from '../chtiot-client/chtiot-client.module';
import { ImageMgmtModule } from '../image-mgmt/image-mgmt.module';
import { ESignageCMRepository } from './eSignageCM.repository';
import {
  EsignageTemplate,
  EsignageTemplateSchema,
} from 'src/models/esignage.template';
import {
  EsignageTemplateContent,
  EsignageTemplateContentSchema,
} from 'src/models/esignage.template.content';
import {
  EsignageTemplateContentDetail,
  EsignageTemplateContentDetailSchema,
} from 'src/models/esignage.template.content.detail';
import {
  EsignageWebpage,
  EsignageWebpageSchema,
} from 'src/models/esignage.webpage';
import { EsignageIpcam, EsignageIpcamSchema } from 'src/models/esignage.ipcam';
import {
  EsignageWeather,
  EsignageWeatherSchema,
} from 'src/models/esignage.weather';
import {
  EsignageMediaPool,
  EsignageMediaPoolSchema,
} from 'src/models/esignage.media.pool';
import {
  EsignageSchedule,
  EsignageScheduleSchema,
} from 'src/models/esignage.schedule';
import {
  EsignageScheduleLogs,
  EsignageScheduleLogsSchema,
} from 'src/models/esignage.schedule.logs';
import {
  EsignageTemplateLogs,
  EsignageTemplateLogsSchema,
} from 'src/models/esignage.template.logs';
import {
  EsignageTemplateContentDetailLogs,
  EsignageTemplateContentDetailLogsSchema,
} from 'src/models/esignage.template.content.detail.logs';
import {
  EsignageTemplateContentLogs,
  EsignageTemplateContentLogsSchema,
} from 'src/models/esignage.template.content.logs';
import {
  EsignageTemplateType,
  EsignageTemplateTypeSchema,
} from 'src/models/esignage.template.type';
import {
  EsignageWeatherStyle,
  EsignageWeatherStyleSchema,
} from 'src/models/esignage.weather.style';
import { LanguageCode, LanguageCodeSchema } from 'src/models/language.code';
import { City, CitySchema } from 'src/models/city';
import {
  EsignageContentType,
  EsignageContentTypeSchema,
} from 'src/models/esignage.content.type';
import {
  EsignageSchedulePublishPlayersLogs,
  EsignageSchedulePublishPlayersLogsSchema,
} from 'src/models/esignage.schedule.publish.players.log';
import { UploadImage, UploadImageSchema } from 'src/models/image-mgmt';
@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: EsignageTemplate.name,
        schema: EsignageTemplateSchema,
        collection: 'esignage_template',
      },
      {
        name: EsignageTemplateContent.name,
        schema: EsignageTemplateContentSchema,
        collection: 'esignage_template_content',
      },
      {
        name: EsignageTemplateContentDetail.name,
        schema: EsignageTemplateContentDetailSchema,
        collection: 'esignage_template_content_detail',
      },
      {
        name: EsignageWebpage.name,
        schema: EsignageWebpageSchema,
        collection: 'esignage_webpage',
      },
      {
        name: EsignageIpcam.name,
        schema: EsignageIpcamSchema,
        collection: 'esignage_ipcam',
      },
      {
        name: EsignageWeather.name,
        schema: EsignageWeatherSchema,
        collection: 'esignage_weather',
      },
      {
        name: EsignageMediaPool.name,
        schema: EsignageMediaPoolSchema,
        collection: 'esignage_media_pool',
      },
      {
        name: EsignageSchedule.name,
        schema: EsignageScheduleSchema,
        collection: 'esignage_schedule',
      },
      {
        name: EsignageScheduleLogs.name,
        schema: EsignageScheduleLogsSchema,
        collection: 'esignage_schedule_logs',
      },
      {
        name: EsignageSchedulePublishPlayersLogs.name,
        schema: EsignageSchedulePublishPlayersLogsSchema,
        collection: 'esignage_schedule_publish_players_logs',
      },
      {
        name: EsignageTemplateLogs.name,
        schema: EsignageTemplateLogsSchema,
        collection: 'esignage_template_logs',
      },
      {
        name: EsignageTemplateContentDetailLogs.name,
        schema: EsignageTemplateContentDetailLogsSchema,
        collection: 'esignage_template_content_detail_logs',
      },
      {
        name: EsignageTemplateContentLogs.name,
        schema: EsignageTemplateContentLogsSchema,
        collection: 'esignage_template_content_logs',
      },
      {
        name: EsignageTemplateType.name,
        schema: EsignageTemplateTypeSchema,
        collection: 'esignage_template_type',
      },
      {
        name: EsignageWeatherStyle.name,
        schema: EsignageWeatherStyleSchema,
        collection: 'esignage_weather_style',
      },
      {
        name: LanguageCode.name,
        schema: LanguageCodeSchema,
        collection: 'language_code',
      },
      {
        name: City.name,
        schema: CitySchema,
        collection: 'city',
      },
      {
        name: EsignageContentType.name,
        schema: EsignageContentTypeSchema,
        collection: 'esignage_content_type',
      },
      {
        name: UploadImage.name,
        schema: UploadImageSchema,
        collection: 'upload_images',
      },
    ]),
    forwardRef(() => GroupModule),
    forwardRef(() => UserModule),
    forwardRef(() => DeviceModule),
    forwardRef(() => ImageMgmtModule),
    GoogleClientModule,
    ImageMgmtModule,
    PermissionModule,
    DeviceModule,
    ChtiotClientModule,
    LogModule,
    HttpModule,
  ],
  providers: [ESignageCMResolver, ESignageCMService, ESignageCMRepository],
  exports: [ESignageCMService],
})
export class ESignageCMModule {}
