import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const makeContext = (req: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => null,
      getClass: () => null,
    }) as unknown as ExecutionContext;

  const buildGuard = (required: string[] | undefined) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(required),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it('passes when no roles metadata is set', () => {
    const guard = buildGuard(undefined);
    const req = { user: { roles: [] } };
    expect(guard.canActivate(makeContext(req))).toBe(true);
  });

  it('passes when the user has one of the required roles', () => {
    const guard = buildGuard(['admin', 'agent']);
    const req = { user: { roles: ['agent'] } };
    expect(guard.canActivate(makeContext(req))).toBe(true);
  });

  it('rejects when the user has none of the required roles', () => {
    const guard = buildGuard(['admin']);
    const req = { user: { roles: ['agent'] } };
    expect(guard.canActivate(makeContext(req))).toBe(false);
  });

  it('rejects when there is no user on the request', () => {
    const guard = buildGuard(['admin']);
    const req = {};
    expect(guard.canActivate(makeContext(req))).toBe(false);
  });
});
