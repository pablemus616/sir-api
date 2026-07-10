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
import { PositionAreasService } from './position-areas.service';
import { CreatePositionAreaDto } from './dto/create-position-area.dto';
import { UpdatePositionAreaDto } from './dto/update-position-area.dto';
import { PaginationDto } from '../config/pagination.dto';
import { RequirePermission } from '../config/permissions.decorator';

// Reads open (feed dropdowns); writes require the explicit permission.
@Controller('position-areas')
export class PositionAreasController {
  constructor(private readonly service: PositionAreasService) {}

  @Post()
  @RequirePermission('position-areas', 'create')
  create(@Body() dto: CreatePositionAreaDto) {
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
  @RequirePermission('position-areas', 'update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePositionAreaDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('position-areas', 'delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
