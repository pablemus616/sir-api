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
import { PipelineStagesService } from './pipeline-stages.service';
import { CreatePipelineStageDto } from './dto/create-pipeline-stage.dto';
import { UpdatePipelineStageDto } from './dto/update-pipeline-stage.dto';
import { QueryPipelineStageDto } from './dto/query-pipeline-stage.dto';
import { Roles } from '../config/roles.decorator';

@Controller('pipeline-stages')
export class PipelineStagesController {
  constructor(private readonly service: PipelineStagesService) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreatePipelineStageDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryPipelineStageDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePipelineStageDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
