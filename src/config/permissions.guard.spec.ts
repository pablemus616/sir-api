import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSION_KEY, type RequiredPermission } from './permissions.decorator';
import { IS_PUBLIC_KEY } from './public.decorator';
import { AuthUser } from './current-user.decorator';

function makeGuard(isPublic: boolean, required: RequiredPermission | undefined) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === IS_PUBLIC_KEY ? isPublic : required,
    ),
  } as unknown as Reflector;
  return new PermissionsGuard(reflector);
}

function ctx(user: Partial<AuthUser> | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => null,
    getClass: () => null,
  } as unknown as ExecutionContext;
}

const user = (roles: string[], permissions: string[]): Partial<AuthUser> => ({
  roles,
  permissions,
});

describe('PermissionsGuard', () => {
  it('passes routes without @RequirePermission', () => {
    const guard = makeGuard(false, undefined);
    expect(guard.canActivate(ctx(user([], [])))).toBe(true);
  });

  it('passes @Public routes even with a required permission and no user', () => {
    const guard = makeGuard(true, { module: 'clients', action: 'read' });
    expect(guard.canActivate(ctx(undefined))).toBe(true);
  });

  it('denies when there is no authenticated user', () => {
    const guard = makeGuard(false, { module: 'clients', action: 'read' });
    expect(guard.canActivate(ctx(undefined))).toBe(false);
  });

  it('lets admin through for any action', () => {
    const guard = makeGuard(false, { module: 'clients', action: 'delete' });
    expect(guard.canActivate(ctx(user(['admin'], [])))).toBe(true);
  });

  it('grants read via either module:read or module:read:own', () => {
    const all = makeGuard(false, { module: 'placements', action: 'read' });
    expect(all.canActivate(ctx(user(['recruiter'], ['placements:read'])))).toBe(true);
    const own = makeGuard(false, { module: 'placements', action: 'read' });
    expect(own.canActivate(ctx(user(['recruiter'], ['placements:read:own'])))).toBe(true);
  });

  it('denies read when the role has neither read grant', () => {
    const guard = makeGuard(false, { module: 'placements', action: 'read' });
    expect(guard.canActivate(ctx(user(['recruiter'], ['clients:read'])))).toBe(false);
  });

  it('requires the exact permission for write actions', () => {
    const ok = makeGuard(false, { module: 'clients', action: 'create' });
    expect(ok.canActivate(ctx(user(['agent'], ['clients:create'])))).toBe(true);
    // read grant does not imply create
    const no = makeGuard(false, { module: 'clients', action: 'create' });
    expect(no.canActivate(ctx(user(['agent'], ['clients:read'])))).toBe(false);
  });
});
