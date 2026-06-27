import { IsIn, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { APPLICATION_STAGES, ApplicationStage } from '../application.entity';

export class FilterApplicationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  opportunityId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  candidateId?: number;

  @IsOptional()
  @IsIn([...APPLICATION_STAGES])
  stage?: ApplicationStage;
}
