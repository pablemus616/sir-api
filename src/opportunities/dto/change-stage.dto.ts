import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

export class ChangeStageDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  pipelineStageId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  @IsOptional()
  @IsString()
  lostReason?: string;
}
