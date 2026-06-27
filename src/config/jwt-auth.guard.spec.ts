import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtTokenService } from './jwt.service';

describe('JwtAuthGuard', () => {
  const makeContext = (req: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => null,
      getClass: () => null,
    }) as unknown as ExecutionContext;

  const buildGuard = (isPublic: boolean, payload?: unknown) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(isPublic),
    } as unknown as Reflector;
    const jwtTokenService = {
      verifyAccessToken: jest.fn().mockImplementation(() => {
        if (!payload) throw new Error('invalid');
        return payload;
      }),
    } as unknown as JwtTokenService;
    return new JwtAuthGuard(reflector, jwtTokenService);
  };

  it('lets public routes pass without a token', () => {
    const guard = buildGuard(true);
    const req: Record<string, unknown> = { headers: {} };
    expect(guard.canActivate(makeContext(req))).toBe(true);
  });

  it('sets request.user from a valid token payload', () => {
    const guard = buildGuard(false, {
      sub: 1,
      employeeId: 7,
      roles: ['admin'],
      sid: 'sid-1',
    });
    const req: Record<string, unknown> = {
      headers: { authorization: 'Bearer good-token' },
    };
    expect(guard.canActivate(makeContext(req))).toBe(true);
    expect(req.user).toEqual({
      userId: 1,
      employeeId: 7,
      roles: ['admin'],
      sessionId: 'sid-1',
    });
  });

  it('throws when the Authorization header is missing', () => {
    const guard = buildGuard(false);
    const req: Record<string, unknown> = { headers: {} };
    expect(() => guard.canActivate(makeContext(req))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws when the token is invalid', () => {
    const guard = buildGuard(false);
    const req: Record<string, unknown> = {
      headers: { authorization: 'Bearer bad-token' },
    };
    expect(() => guard.canActivate(makeContext(req))).toThrow(
      UnauthorizedException,
    );
  });
});
