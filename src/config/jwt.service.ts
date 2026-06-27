import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

export interface AccessPayload {
  sub: number;
  employeeId: number;
  roles: string[];
  sid: string;
}

@Injectable()
export class JwtTokenService {
  constructor(private readonly config: ConfigService) {}

  signAccessToken(payload: AccessPayload): string {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET')!;
    const expiresIn = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const options = { expiresIn } as SignOptions;
    return jwt.sign(payload, secret, options);
  }

  verifyAccessToken(token: string): AccessPayload {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET')!;
    const decoded = jwt.verify(token, secret) as JwtPayload;
    return {
      sub: decoded.sub as unknown as number,
      employeeId: decoded.employeeId as number,
      roles: decoded.roles as string[],
      sid: decoded.sid as string,
    };
  }

  generateRefreshToken(): { token: string; tokenHash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
