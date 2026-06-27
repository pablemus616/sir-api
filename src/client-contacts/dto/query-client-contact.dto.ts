import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';
import { PaginationDto } from '../../config/pagination.dto';

export class QueryClientContactDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;
}
