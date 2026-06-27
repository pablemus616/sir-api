import { PartialType } from '@nestjs/mapped-types';
import { CreatePositionAreaDto } from './create-position-area.dto';

export class UpdatePositionAreaDto extends PartialType(CreatePositionAreaDto) {}
