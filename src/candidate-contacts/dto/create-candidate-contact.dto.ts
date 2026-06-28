// src/candidate-contacts/dto/create-candidate-contact.dto.ts
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ContactDirection } from '../../config/enums';

export class CreateCandidateContactDto {
  @Type(() => Number)
  @IsInt()
  candidateId: number;

  @Type(() => Number)
  @IsInt()
  opportunityId: number;

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
}
