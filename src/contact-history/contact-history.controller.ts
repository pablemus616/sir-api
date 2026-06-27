import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ContactHistoryService } from './contact-history.service';
import { CreateContactHistoryDto } from './dto/create-contact-history.dto';
import { QueryContactHistoryDto } from './dto/query-contact-history.dto';
import { CurrentUser, type AuthUser } from '../config/current-user.decorator';

@Controller('contact-history')
export class ContactHistoryController {
  constructor(private readonly contactHistoryService: ContactHistoryService) {}

  @Post()
  create(@Body() dto: CreateContactHistoryDto, @CurrentUser() user: AuthUser) {
    return this.contactHistoryService.create(dto, user.employeeId);
  }

  @Get()
  findAll(@Query() query: QueryContactHistoryDto) {
    return this.contactHistoryService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contactHistoryService.findOne(id);
  }
}
