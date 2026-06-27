import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class HandleContactRequestDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  resultingClientId?: number;
}
