import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
import { Session } from './session.entity';
import { User } from '../users/user.entity';
import { Employee } from '../employees/employee.entity';
import { JwtTokenService } from '../config/jwt.service';
import { AuthUser } from '../config/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    private readonly jwtService: JwtTokenService,
  ) {}

  async login(dto: LoginDto, ip?: string): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.userRepo.findOne({
      where: { username: dto.username },
      relations: { roles: { permissions: true } },
    });
    if (!user) {
      await bcrypt.compare(dto.password, DUMMY_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const refresh = this.jwtService.generateRefreshToken();
    const inserted = await this.sessionRepo
      .createQueryBuilder()
      .insert()
      .into(Session)
      .values({ userId: user.id, token: refresh.tokenHash, ip, creationDate: new Date() })
      .returning('id')
      .execute();
    const sid = (inserted.raw[0] as { id: string }).id;

    const accessToken = this.jwtService.signAccessToken({
      sub: user.id,
      employeeId: user.employeeId,
      roles: user.roles.map((r) => r.name),
      permissions: this.effectivePermissions(user),
      sid,
    });
    return { accessToken, refreshToken: refresh.token };
  }

  async refresh(dto: RefreshDto, ip?: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.jwtService.hashRefreshToken(dto.refreshToken);
    const session = await this.sessionRepo.findOne({ where: { token: tokenHash } });
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    const base = session.refreshedAt ?? session.creationDate;
    if (base.getTime() + this.refreshTtlMs() < Date.now()) {
      await this.sessionRepo.delete(session.id);
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.userRepo.findOne({
      where: { id: session.userId },
      relations: { roles: { permissions: true } },
    });
    if (!user) throw new UnauthorizedException('Invalid refresh token');

    const next = this.jwtService.generateRefreshToken();
    session.token = next.tokenHash;
    session.refreshedAt = new Date();
    if (ip) session.ip = ip;
    await this.sessionRepo.save(session);

    const accessToken = this.jwtService.signAccessToken({
      sub: user.id,
      employeeId: user.employeeId,
      roles: user.roles.map((r) => r.name),
      permissions: this.effectivePermissions(user),
      sid: session.id,
    });
    return { accessToken, refreshToken: next.token };
  }

  async logout(user: AuthUser): Promise<void> {
    await this.sessionRepo.delete(user.sessionId);
  }

  async me(user: AuthUser): Promise<{
    id: number;
    username: string;
    employeeId: number;
    employee: Employee;
    roles: { id: number; name: string }[];
    permissions: string[];
  }> {
    const found = await this.userRepo.findOne({
      where: { id: user.userId },
      relations: { roles: { permissions: true }, employee: true },
      select: { id: true, username: true, employeeId: true },
    });
    if (!found) throw new NotFoundException('User not found');
    return {
      id: found.id,
      username: found.username,
      employeeId: found.employeeId,
      employee: found.employee,
      roles: found.roles.map((r) => ({ id: r.id, name: r.name })),
      permissions: this.effectivePermissions(found),
    };
  }

  /** Union of the permission names granted by all of the user's roles. */
  private effectivePermissions(user: User): string[] {
    const set = new Set<string>();
    for (const role of user.roles ?? []) {
      for (const p of role.permissions ?? []) set.add(p.name);
    }
    return [...set];
  }

  listSessions(user: AuthUser): Promise<Session[]> {
    return this.sessionRepo.find({
      where: { userId: user.userId },
      select: { id: true, creationDate: true, refreshedAt: true, ip: true },
    });
  }

  async revokeSession(user: AuthUser, id: string): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { id, userId: user.userId } });
    if (!session) throw new NotFoundException('Session not found');
    await this.sessionRepo.delete(session.id);
  }

  private refreshTtlMs(): number {
    const ttl = process.env.JWT_REFRESH_TTL ?? '30d';
    const m = ttl.match(/^(\d+)([smhd])$/);
    if (!m) return 30 * 86400000;
    const n = Number(m[1]);
    const unit = m[2];
    const mult = unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
    return n * mult;
  }
}
