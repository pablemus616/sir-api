import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ContactRequestDto {
  @IsString()
  @IsNotEmpty()
  name: string;
  @IsEmail()
  email: string;
  @IsString()
  @IsNotEmpty()
  company: string;
  @IsString()
  @IsNotEmpty()
  message: string;
}