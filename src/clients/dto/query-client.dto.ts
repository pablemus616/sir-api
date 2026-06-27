import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';
import { PaginationDto } from '../../config/pagination.dto';

export class QueryClientDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sectorId?: number;
}
