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
import { ClientContactsService } from './client-contacts.service';
import { CreateClientContactDto } from './dto/create-client-contact.dto';
import { UpdateClientContactDto } from './dto/update-client-contact.dto';
import { QueryClientContactDto } from './dto/query-client-contact.dto';
import { RequirePermission } from '../config/permissions.decorator';

@RequirePermission('client-contacts', 'read')
@Controller('client-contacts')
export class ClientContactsController {
  constructor(private readonly service: ClientContactsService) {}

  @Post()
  @RequirePermission('client-contacts', 'create')
  create(@Body() dto: CreateClientContactDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryClientContactDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('client-contacts', 'update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientContactDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('client-contacts', 'delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
