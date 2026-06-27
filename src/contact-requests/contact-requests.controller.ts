import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ContactRequestsService } from './contact-requests.service';
import { CreateContactRequestDto } from './dto/create-contact-request.dto';
import { QueryContactRequestDto } from './dto/query-contact-request.dto';
import { HandleContactRequestDto } from './dto/handle-contact-request.dto';
import { Public } from '../config/public.decorator';
import { ApiKeyGuard } from '../config/api-key.guard';
import { CurrentUser, type AuthUser } from '../config/current-user.decorator';

@Controller('contact-requests')
export class ContactRequestsController {
  constructor(private readonly contactRequestsService: ContactRequestsService) {}

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post()
  create(@Body() dto: CreateContactRequestDto) {
    return this.contactRequestsService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryContactRequestDto) {
    return this.contactRequestsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contactRequestsService.findOne(id);
  }

  @Patch(':id/handle')
  handle(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: HandleContactRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.contactRequestsService.handle(id, dto, user.employeeId);
  }
}
