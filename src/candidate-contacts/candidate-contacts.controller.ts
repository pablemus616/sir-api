// src/candidate-contacts/candidate-contacts.controller.ts
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
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

  // Admin ve todas las interacciones; el reclutador no-admin solo las suyas
  // (se fuerza el filtro recruiterId al employeeId del token).
  @Get()
  findAll(@Query() query: QueryCandidateContactsDto, @CurrentUser() user: AuthUser) {
    if (!user.roles.includes('admin')) {
      query.recruiterId = user.employeeId;
    }
    return this.service.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    const contact = await this.service.findOne(id);
    if (!user.roles.includes('admin') && contact.recruiterEmployeeId !== user.employeeId) {
      throw new ForbiddenException('No autorizado');
    }
    return contact;
  }
}
