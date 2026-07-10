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
import { ContactTypesService } from './contact-types.service';
import { CreateContactTypeDto } from './dto/create-contact-type.dto';
import { UpdateContactTypeDto } from './dto/update-contact-type.dto';
import { PaginationDto } from '../config/pagination.dto';
import { RequirePermission } from '../config/permissions.decorator';

// Reads open (feed dropdowns); writes require the explicit permission.
@Controller('contact-types')
export class ContactTypesController {
  constructor(private readonly service: ContactTypesService) {}

  @Post()
  @RequirePermission('contact-types', 'create')
  create(@Body() dto: CreateContactTypeDto) {
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
  @RequirePermission('contact-types', 'update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContactTypeDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('contact-types', 'delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
