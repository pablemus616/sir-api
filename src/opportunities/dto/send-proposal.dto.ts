import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class SendProposalDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;
}
