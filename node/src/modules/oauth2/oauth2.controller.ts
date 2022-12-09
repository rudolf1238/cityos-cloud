import { Controller, Get, Post, Req, Res, Render } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../auth/auth.decorator';
import { Oauth2Service } from './oauth2.service';

@Controller('oauth2')
export class Oauth2Controller {
  constructor(private readonly oauth2Service: Oauth2Service) {}

  @Public()
  @Get('authenticate')
  @Render('authenticate')
  root() {
    return { title: 'Node Express OAuth Server' };
  }

  @Public()
  @Post('authenticate')
  async authenticate(@Req() req: Request, @Res() res: Response) {
    return this.oauth2Service.authenticate(req, res);
  }

  @Public()
  @Post('access_token')
  async accessToken(@Req() req: Request, @Res() res: Response) {
    return this.oauth2Service.accessToken(req, res);
  }
}
