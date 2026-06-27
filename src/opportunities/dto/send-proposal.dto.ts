import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class SendProposalDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;
}
