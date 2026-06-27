import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreateContactRequestDto {
  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  requestDesc?: string;
}
