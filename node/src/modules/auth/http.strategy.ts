import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Strategy } from 'passport-http-bearer';
import { AuthService } from './auth.service';
import { Request } from 'express';

@Injectable()
export class HttpStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      passReqToCallback: true,
    });
  }

  async validate(req: Request, accessToken: string): Promise<any> {
    // we could do a database lookup in our validate()
    // method to extract more information about the user
    const token = await this.authService.getAccessToken(accessToken);
    const current = new Date();

    if (
      token === null ||
      current.getTime() > token.accessTokenExpiresAt.getTime()
    ) {
      throw new UnauthorizedException();
    }

    // using group-id in req.headers to determine the group user is using
    const groupId = req.headers['group-id'] as string;
    token.user.groups.forEach((gInfo) => {
      gInfo.switchGroup(gInfo.group._id.toHexString() === groupId);
    });

    return { userModel: token.user };
  }
}
