import { Args, Mutation, Query, Resolver, Subscription } from '@nestjs/graphql';
import {
  Action,
  DeviceType,
  ElasticSearchInput,
  Subject,
} from 'src/graphql.schema';
import { UseGuards } from '@nestjs/common';
import { User } from 'src/models/user';
import { CurrentUser } from '../auth/auth.decorator';
import { PermissionGuard } from '../permission/permission.guard';
import { CheckPermissions } from '../permission/permission.handler';
import { AppAbility } from '../permission/ability.factory';
import { ElasticSearchSensor } from 'src/models/elasticsearch.sensor';
import { ElasticsearchSensorService } from './elasticsearch-sensor.service';

@Resolver('ElasticsearchSensor')
export class ElasticsearchSensorResolver {
  constructor(
    private readonly elasticsearchSensorService: ElasticsearchSensorService,
  ) {}

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.ELASTIC_SEARCH),
  )
  @Query()
  async elasticSearchSetting(): Promise<ElasticSearchSensor[]> {
    return this.elasticsearchSensorService.elasticSearchSetting();
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.ELASTIC_SEARCH),
  )
  @Mutation()
  async addToElasticSearch(
    @Args('elasticSearchInput') elasticSearchInput: ElasticSearchInput,
  ): Promise<ElasticSearchSensor> {
    return this.elasticsearchSensorService.addToElasticSearch(
      elasticSearchInput,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.ELASTIC_SEARCH),
  )
  @Mutation()
  async deleteFromElasticSearch(
    @Args('deviceType') deviceType: DeviceType,
    @Args('sensorId') sensorId: string,
  ): Promise<ElasticSearchSensor> {
    return this.elasticsearchSensorService.deleteIndexFromElasticSearch(
      deviceType,
      sensorId,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.ELASTIC_SEARCH),
  )
  @Mutation()
  async enableElasticSearch(
    @CurrentUser() user: User,
    @Args('deviceType') deviceType: DeviceType,
    @Args('sensorId') sensorId: string,
    @Args('enable') enable: boolean,
  ): Promise<ElasticSearchSensor> {
    return this.elasticsearchSensorService.enableElasticSearch(
      deviceType,
      sensorId,
      enable,
    );
  }

  @UseGuards(PermissionGuard)
  @CheckPermissions((ability: AppAbility) =>
    ability.can(Action.VIEW, Subject.ELASTIC_SEARCH),
  )
  @Subscription(() => ElasticSearchSensor)
  async processElasticSearchChanged(
    @Args('deviceType') deviceType: DeviceType,
    @Args('sensorId') sensorId: string,
  ) {
    return this.elasticsearchSensorService.processElasticSearchChanged(
      deviceType,
      sensorId,
    );
  }
}
