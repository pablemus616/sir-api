import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ContactDirection } from '../../config/enums';

export class CreateContactHistoryDto {
  @Type(() => Number)
  @IsInt()
  contactId: number;

  @Type(() => Number)
  @IsInt()
  contactType: number;

  @IsDateString()
  contactTime: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  callLength?: number;

  @IsOptional()
  @IsString()
  contactDesc?: string;

  @IsOptional()
  @IsString()
  phoneNumberDialed?: string;

  @IsOptional()
  @IsEnum(ContactDirection)
  direction?: ContactDirection;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  opportunityId?: number;
}
