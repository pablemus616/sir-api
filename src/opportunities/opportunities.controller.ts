import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { QueryOpportunityDto } from './dto/query-opportunity.dto';
import { ChangeStageDto } from './dto/change-stage.dto';
import { SendProposalDto } from './dto/send-proposal.dto';
import { FollowUpDto } from './dto/follow-up.dto';
import { LoseOpportunityDto } from './dto/lose-opportunity.dto';
import { CurrentUser, type AuthUser } from '../config/current-user.decorator';
import { RequirePermission, dataScopeFor } from '../config/permissions.decorator';

@RequirePermission('opportunities', 'read')
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  @RequirePermission('opportunities', 'create')
  create(@Body() dto: CreateOpportunityDto) {
    return this.opportunitiesService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryOpportunityDto, @CurrentUser() user: AuthUser) {
    if (dataScopeFor(user, 'opportunities') === 'own') {
      query.responsibleEmployeeId = user.employeeId;
    }
    return this.opportunitiesService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    const opportunity = await this.opportunitiesService.findOne(id);
    if (
      dataScopeFor(user, 'opportunities') === 'own' &&
      opportunity.responsibleEmployeeId !== user.employeeId
    ) {
      throw new ForbiddenException('No autorizado');
    }
    return opportunity;
  }

  @Patch(':id')
  @RequirePermission('opportunities', 'update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOpportunityDto) {
    return this.opportunitiesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('opportunities', 'delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.opportunitiesService.remove(id);
  }

  @Patch(':id/stage')
  @RequirePermission('opportunities', 'update')
  changeStage(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeStageDto) {
    return this.opportunitiesService.changeStage(id, dto);
  }

  @Patch(':id/proposal')
  @RequirePermission('opportunities', 'update')
  sendProposal(@Param('id', ParseIntPipe) id: number, @Body() dto: SendProposalDto) {
    return this.opportunitiesService.sendProposal(id, dto);
  }

  @Patch(':id/follow-up')
  @RequirePermission('opportunities', 'update')
  setFollowUp(@Param('id', ParseIntPipe) id: number, @Body() dto: FollowUpDto) {
    return this.opportunitiesService.setFollowUp(id, dto);
  }

  @Patch(':id/win')
  @RequirePermission('opportunities', 'update')
  win(@Param('id', ParseIntPipe) id: number) {
    return this.opportunitiesService.win(id);
  }

  @Patch(':id/lose')
  @RequirePermission('opportunities', 'update')
  lose(@Param('id', ParseIntPipe) id: number, @Body() dto: LoseOpportunityDto) {
    return this.opportunitiesService.lose(id, dto);
  }
}
