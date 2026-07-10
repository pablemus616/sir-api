import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtTokenService } from './jwt.service';
import { AuthUser } from './current-user.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: AuthUser }>();
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const token = header.slice(7);
    try {
      const payload = this.jwtTokenService.verifyAccessToken(token);
      request.user = {
        userId: payload.sub,
        employeeId: payload.employeeId,
        roles: payload.roles,
        permissions: payload.permissions ?? [],
        sessionId: payload.sid,
      };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
