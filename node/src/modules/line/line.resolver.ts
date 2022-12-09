import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { LineBindingPayload } from 'src/graphql.schema';
import { Public } from '../auth/auth.decorator';
import { LineService } from './line.service';

@Resolver('Line')
export class LineResolver {
  constructor(private readonly lineService: LineService) {}

  @Public()
  @Mutation('lineBinding')
  async lineBinding(
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<LineBindingPayload> {
    return this.lineService.lineBinding(email, password);
  }

  @Public()
  @Mutation('lineNotifyBinding')
  async lineNotifyBinding(
    @Args('code') code: string,
    @Args('state') state: string,
  ): Promise<boolean> {
    return this.lineService.lineNotifyBinding(code, state);
  }
}
