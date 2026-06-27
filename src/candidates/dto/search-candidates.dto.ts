import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../config/pagination.dto';
import { CANDIDATE_STATUSES, type CandidateStatus } from '../candidate.entity';

export class SearchCandidatesDto extends PaginationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsIn([...CANDIDATE_STATUSES])
  status?: CandidateStatus;

  @IsOptional()
  @IsString()
  source?: string;
}
