import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Session } from './session.entity';
import { User } from '../users/user.entity';
import { JwtTokenService } from '../config/jwt.service';

@Module({
  imports: [TypeOrmModule.forFeature([Session, User])],
  controllers: [AuthController],
  providers: [AuthService, JwtTokenService],
})
export class AuthModule {}
