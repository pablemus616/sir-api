import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { PERMISSION_KEY, type RequiredPermission } from './permissions.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthUser } from './current-user.decorator';

/**
 * Enforces `@RequirePermission(module, action)`. Routes without the decorator
 * pass through (login-only, as before). `admin` bypasses everything. For read,
 * either `<module>:read` (all) or `<module>:read:own` (own) grants access.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Public routes (e.g. the inbound contact-request webhook) never carry a
    // user, so they must bypass permission checks even under a class-level
    // @RequirePermission.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<RequiredPermission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: AuthUser }>();
    const user = request.user;
    if (!user) return false;
    if (user.roles?.includes('admin')) return true;

    const perms = user.permissions ?? [];
    if (required.action === 'read') {
      return (
        perms.includes(`${required.module}:read`) ||
        perms.includes(`${required.module}:read:own`)
      );
    }
    return perms.includes(`${required.module}:${required.action}`);
  }
}
