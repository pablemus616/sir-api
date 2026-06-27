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
import { PlacementsService } from './placements.service';
import { CreatePlacementDto } from './dto/create-placement.dto';
import { UpdatePlacementDto } from './dto/update-placement.dto';
import { SearchPlacementsDto } from './dto/search-placements.dto';
import { CurrentUser, type AuthUser } from '../config/current-user.decorator';

@Controller('placements')
export class PlacementsController {
  constructor(private readonly placementsService: PlacementsService) {}

  @Post()
  create(@Body() dto: CreatePlacementDto, @CurrentUser() user: AuthUser) {
    return this.placementsService.create(dto, user);
  }

  @Get()
  findAll(@Query() query: SearchPlacementsDto) {
    return this.placementsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.placementsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlacementDto,
  ) {
    return this.placementsService.update(id, dto);
  }
}
