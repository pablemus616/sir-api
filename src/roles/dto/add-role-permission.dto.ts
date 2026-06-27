import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class AddRolePermissionDto {
  @Type(() => Number)
  @IsInt()
  permissionId: number;
}
