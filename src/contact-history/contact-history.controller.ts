import { Body, Controller, ForbiddenException, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ContactHistoryService } from './contact-history.service';
import { CreateContactHistoryDto } from './dto/create-contact-history.dto';
import { QueryContactHistoryDto } from './dto/query-contact-history.dto';
import { CurrentUser, type AuthUser } from '../config/current-user.decorator';
import { RequirePermission, dataScopeFor } from '../config/permissions.decorator';

@RequirePermission('contact-history', 'read')
@Controller('contact-history')
export class ContactHistoryController {
  constructor(private readonly contactHistoryService: ContactHistoryService) {}

  @Post()
  @RequirePermission('contact-history', 'create')
  create(@Body() dto: CreateContactHistoryDto, @CurrentUser() user: AuthUser) {
    return this.contactHistoryService.create(dto, user.employeeId);
  }

  @Get()
  findAll(@Query() query: QueryContactHistoryDto, @CurrentUser() user: AuthUser) {
    // `own` scope: only the caller's own logged interactions.
    if (dataScopeFor(user, 'contact-history') === 'own') {
      query.employeeId = user.employeeId;
    }
    return this.contactHistoryService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    const history = await this.contactHistoryService.findOne(id);
    if (
      dataScopeFor(user, 'contact-history') === 'own' &&
      history.employeeId !== user.employeeId
    ) {
      throw new ForbiddenException('No autorizado');
    }
    return history;
  }
}
