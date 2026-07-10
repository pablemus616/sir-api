import {
  Body,
  Controller,
  ForbiddenException,
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
import { RequirePermission, dataScopeFor } from '../config/permissions.decorator';

@RequirePermission('placements', 'read')
@Controller('placements')
export class PlacementsController {
  constructor(private readonly placementsService: PlacementsService) {}

  @Post()
  @RequirePermission('placements', 'create')
  create(@Body() dto: CreatePlacementDto, @CurrentUser() user: AuthUser) {
    return this.placementsService.create(dto, user);
  }

  @Get()
  findAll(@Query() query: SearchPlacementsDto, @CurrentUser() user: AuthUser) {
    // `own` scope: force the recruiter filter to the caller's own employee id.
    if (dataScopeFor(user, 'placements') === 'own') {
      query.recruiterId = user.employeeId;
    }
    return this.placementsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    const placement = await this.placementsService.findOne(id);
    if (
      dataScopeFor(user, 'placements') === 'own' &&
      placement.placedByEmployeeId !== user.employeeId
    ) {
      throw new ForbiddenException('No autorizado');
    }
    return placement;
  }

  @Patch(':id')
  @RequirePermission('placements', 'update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePlacementDto,
  ) {
    return this.placementsService.update(id, dto);
  }
}
