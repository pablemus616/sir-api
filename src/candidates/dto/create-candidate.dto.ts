import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CANDIDATE_STATUSES, type CandidateStatus } from '../candidate.entity';

export class CreateCandidateDto {
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  secondName?: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  surName?: string;

  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  headline?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  expectedSalary?: number;

  @IsOptional()
  @IsIn([...CANDIDATE_STATUSES])
  status?: CandidateStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
