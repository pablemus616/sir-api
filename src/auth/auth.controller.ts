import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '../config/public.decorator';
import { CurrentUser, type AuthUser } from '../config/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  public login(@Body() dto: LoginDto, @Req() req: FastifyRequest) {
    return this.authService.login(dto, req.ip);
  }

  @Public()
  @Post('refresh')
  public refresh(@Body() dto: RefreshDto, @Req() req: FastifyRequest) {
    return this.authService.refresh(dto, req.ip);
  }

  @Post('logout')
  public logout(@CurrentUser() user: AuthUser) {
    return this.authService.logout(user);
  }

  @Get('me')
  public me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user);
  }

  @Get('sessions')
  public sessions(@CurrentUser() user: AuthUser) {
    return this.authService.listSessions(user);
  }

  @Delete('sessions/:id')
  public revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.authService.revokeSession(user, id);
  }
}
