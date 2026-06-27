import { IsNotEmpty, IsString } from 'class-validator';

export class CreateContactTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
