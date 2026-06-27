import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 20;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export function getSkipTake(pagination: PaginationDto): {
  skip: number;
  take: number;
} {
  const page = pagination.page ?? 1;
  const limit = pagination.limit ?? 20;
  return { skip: (page - 1) * limit, take: limit };
}
