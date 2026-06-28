// src/candidate-contacts/dto/query-candidate-contacts.dto.ts
import { IsDateString, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../config/pagination.dto';

export class QueryCandidateContactsDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  candidateId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  opportunityId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  recruiterId?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
