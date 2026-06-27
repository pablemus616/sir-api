import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePositionAreaDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
