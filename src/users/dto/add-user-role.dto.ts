import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class AddUserRoleDto {
  @Type(() => Number)
  @IsInt()
  roleId: number;
}
