import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../roles/permission.entity';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { PermissionsSyncService } from './permissions-sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([Permission])],
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionsSyncService],
})
export class PermissionsModule {}
