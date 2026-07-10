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
import { RequirePermission, dataScopeFor } from '../config/permissions.decorator';

@RequirePermission('candidate-contacts', 'read')
@Controller('candidate-contacts')
export class CandidateContactsController {
  constructor(private readonly service: CandidateContactsService) {}

  @Post()
  @RequirePermission('candidate-contacts', 'create')
  create(@Body() dto: CreateCandidateContactDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.employeeId);
  }

  // `own` scope forces the recruiterId filter to the caller's employee id;
  // `all` (admin or the module:read grant) sees every interaction.
  @Get()
  findAll(@Query() query: QueryCandidateContactsDto, @CurrentUser() user: AuthUser) {
    if (dataScopeFor(user, 'candidate-contacts') === 'own') {
      query.recruiterId = user.employeeId;
    }
    return this.service.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    const contact = await this.service.findOne(id);
    if (
      dataScopeFor(user, 'candidate-contacts') === 'own' &&
      contact.recruiterEmployeeId !== user.employeeId
    ) {
      throw new ForbiddenException('No autorizado');
    }
    return contact;
  }
}
