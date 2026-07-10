import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
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

  /**
   * Cuando es `true`, devuelve solo candidatos "disponibles": sin ninguna
   * aplicación distinta de 'withdrawn' (sin proceso activo, sin placement y sin
   * rechazo). Lo usa el selector de candidatos al crear una aplicación nueva.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  available?: boolean;
}
