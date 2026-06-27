import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { APPLICATION_STAGES, ApplicationStage } from '../application.entity';

export class CreateApplicationDto {
  @Type(() => Number)
  @IsInt()
  candidateId: number;

  @Type(() => Number)
  @IsInt()
  opportunityId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  referredByEmployeeId?: number;

  @IsOptional()
  @IsIn([...APPLICATION_STAGES])
  stage?: ApplicationStage;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
