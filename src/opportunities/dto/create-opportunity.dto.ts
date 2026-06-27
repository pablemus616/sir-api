import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Seniority } from '../../config/enums';

export class CreateOpportunityDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clientId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  areaId?: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  responsibleEmployeeId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  clientContactId?: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  pipelineStageId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  originContactRequestId?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsEnum(Seniority)
  seniority?: Seniority;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  headcount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;
}
