// src/candidate-contacts/candidate-contacts.controller.ts
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CandidateContactsService } from './candidate-contacts.service';
import { CreateCandidateContactDto } from './dto/create-candidate-contact.dto';
import { QueryCandidateContactsDto } from './dto/query-candidate-contacts.dto';
import { CurrentUser, type AuthUser } from '../config/current-user.decorator';

@Controller('candidate-contacts')
export class CandidateContactsController {
  constructor(private readonly service: CandidateContactsService) {}

  @Post()
  create(@Body() dto: CreateCandidateContactDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.employeeId);
  }

  @Get()
  findAll(@Query() query: QueryCandidateContactsDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
