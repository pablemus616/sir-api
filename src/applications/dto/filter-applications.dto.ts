import { IsIn, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { APPLICATION_STAGES, ApplicationStage } from '../application.entity';
import { PaginationDto } from '../../config/pagination.dto';

export class FilterApplicationsDto extends PaginationDto {
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
