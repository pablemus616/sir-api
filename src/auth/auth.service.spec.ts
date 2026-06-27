import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { Session } from './session.entity';
import { User } from '../users/user.entity';
import { JwtTokenService } from '../config/jwt.service';

describe('AuthService', () => {
  let service: AuthService;
  const userRepo = { findOne: jest.fn() };
  const sessionRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const jwtService = {
    signAccessToken: jest.fn().mockReturnValue('access-1'),
    generateRefreshToken: jest.fn().mockReturnValue({ token: 'r-new', tokenHash: 'h-new' }),
    hashRefreshToken: jest.fn().mockReturnValue('h-in'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.JWT_REFRESH_TTL = '30d';
    const mod = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Session), useValue: sessionRepo },
        { provide: JwtTokenService, useValue: jwtService },
      ],
    }).compile();
    service = mod.get(AuthService);
  });

  it('login issues access + refresh and persists the session', async () => {
    const hash = await bcrypt.hash('pw', 10);
    userRepo.findOne.mockResolvedValue({ id: 1, username: 'a', password: hash, employeeId: 9, roles: [{ name: 'admin' }] });
    sessionRepo.createQueryBuilder.mockReturnValue({
      insert: () => ({ into: () => ({ values: () => ({ returning: () => ({ execute: () => Promise.resolve({ raw: [{ id: 'sid-1' }] }) }) }) }) }),
    });
    const out = await service.login({ username: 'a', password: 'pw' }, '1.2.3.4');
    expect(out).toEqual({ accessToken: 'access-1', refreshToken: 'r-new' });
    expect(jwtService.signAccessToken).toHaveBeenCalledWith({ sub: 1, employeeId: 9, roles: ['admin'], sid: 'sid-1' });
  });

  it('login rejects a bad password', async () => {
    const hash = await bcrypt.hash('pw', 10);
    userRepo.findOne.mockResolvedValue({ id: 1, username: 'a', password: hash, employeeId: 9, roles: [] });
    await expect(service.login({ username: 'a', password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refresh rotates the token and stamps refreshedAt', async () => {
    sessionRepo.findOne.mockResolvedValue({ id: 'sid-1', userId: 1, token: 'h-in', creationDate: new Date(), refreshedAt: null });
    userRepo.findOne.mockResolvedValue({ id: 1, employeeId: 9, roles: [{ name: 'admin' }] });
    const out = await service.refresh({ refreshToken: 'r-in' });
    expect(out).toEqual({ accessToken: 'access-1', refreshToken: 'r-new' });
    const saved = sessionRepo.save.mock.calls[0][0];
    expect(saved.token).toBe('h-new');
    expect(saved.refreshedAt).toBeInstanceOf(Date);
  });

  it('refresh rejects an expired session and deletes it', async () => {
    const old = new Date(Date.now() - 40 * 86400000);
    sessionRepo.findOne.mockResolvedValue({ id: 'sid-1', userId: 1, token: 'h-in', creationDate: old, refreshedAt: null });
    await expect(service.refresh({ refreshToken: 'r-in' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessionRepo.delete).toHaveBeenCalledWith('sid-1');
  });

  it('refresh rejects an unknown refresh token', async () => {
    sessionRepo.findOne.mockResolvedValue(null);
    await expect(service.refresh({ refreshToken: 'bogus' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout deletes the current session', async () => {
    await service.logout({ userId: 1, employeeId: 9, roles: [], sessionId: 'sid-1' });
    expect(sessionRepo.delete).toHaveBeenCalledWith('sid-1');
  });
});
