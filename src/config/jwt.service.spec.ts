import { ConfigService } from '@nestjs/config';
import { JwtTokenService, AccessPayload } from './jwt.service';

describe('JwtTokenService', () => {
  let service: JwtTokenService;

  const config = {
    get: (key: string) =>
      ({
        JWT_ACCESS_SECRET: 'test-access-secret',
        JWT_ACCESS_TTL: '15m',
      })[key],
  } as unknown as ConfigService;

  const payload: AccessPayload = {
    sub: 1,
    employeeId: 7,
    roles: ['admin'],
    sid: 'session-1',
  };

  beforeEach(() => {
    service = new JwtTokenService(config);
  });

  it('signs and verifies an access token round-trip', () => {
    const token = service.signAccessToken(payload);
    const decoded = service.verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.employeeId).toBe(payload.employeeId);
    expect(decoded.roles).toEqual(payload.roles);
    expect(decoded.sid).toBe(payload.sid);
  });

  it('throws when verifying a tampered token', () => {
    const token = service.signAccessToken(payload);
    expect(() => service.verifyAccessToken(token + 'x')).toThrow();
  });

  it('generates a refresh token with a matching sha256 hash', () => {
    const { token, tokenHash } = service.generateRefreshToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(tokenHash).toBe(service.hashRefreshToken(token));
  });

  it('hashes refresh tokens deterministically', () => {
    expect(service.hashRefreshToken('abc')).toBe(
      service.hashRefreshToken('abc'),
    );
    expect(service.hashRefreshToken('abc')).not.toBe(
      service.hashRefreshToken('abd'),
    );
  });
});
