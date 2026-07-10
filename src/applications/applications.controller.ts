import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ChangeApplicationStageDto } from './dto/change-application-stage.dto';
import { FilterApplicationsDto } from './dto/filter-applications.dto';
import { RequirePermission } from '../config/permissions.decorator';

@RequirePermission('applications', 'read')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @RequirePermission('applications', 'create')
  create(@Body() dto: CreateApplicationDto) {
    return this.applicationsService.create(dto);
  }

  @Get()
  findAll(@Query() query: FilterApplicationsDto) {
    return this.applicationsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.applicationsService.findOne(id);
  }

  @Patch(':id/stage')
  @RequirePermission('applications', 'update')
  changeStage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeApplicationStageDto,
  ) {
    return this.applicationsService.changeStage(id, dto);
  }
}
