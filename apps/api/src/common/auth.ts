import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class JwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET!) as any;
      return true;
    } catch {
      throw new UnauthorizedException('Sessiya bitib');
    }
  }
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest().user;
  },
);