import { IsOptional, IsString } from 'class-validator';

export class LoseOpportunityDto {
  @IsOptional()
  @IsString()
  lostReason?: string;
}
