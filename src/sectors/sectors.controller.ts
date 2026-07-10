import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SectorsService } from './sectors.service';
import { CreateSectorDto } from './dto/create-sector.dto';
import { UpdateSectorDto } from './dto/update-sector.dto';
import { PaginationDto } from '../config/pagination.dto';
import { RequirePermission } from '../config/permissions.decorator';

// Reads stay open to any authenticated user (sectors feed dropdowns everywhere);
// writes require the explicit permission.
@Controller('sectors')
export class SectorsController {
  constructor(private readonly service: SectorsService) {}

  @Post()
  @RequirePermission('sectors', 'create')
  create(@Body() dto: CreateSectorDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('sectors', 'update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSectorDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('sectors', 'delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
