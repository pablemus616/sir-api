import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ContactRequestDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;
  @IsEmail()
  email: string;
  @IsString()
  @IsNotEmpty()
  empresa: string;
  @IsString()
  @IsNotEmpty()
  mensaje: string;
}