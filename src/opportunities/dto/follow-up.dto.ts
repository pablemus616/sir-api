import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';

export class FollowUpDto {
  @Type(() => Date)
  @IsDate()
  nextFollowUpAt: Date;
}
