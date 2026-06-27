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
import { OpportunitiesService } from './opportunities.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { QueryOpportunityDto } from './dto/query-opportunity.dto';
import { ChangeStageDto } from './dto/change-stage.dto';
import { SendProposalDto } from './dto/send-proposal.dto';
import { FollowUpDto } from './dto/follow-up.dto';
import { LoseOpportunityDto } from './dto/lose-opportunity.dto';

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  create(@Body() dto: CreateOpportunityDto) {
    return this.opportunitiesService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryOpportunityDto) {
    return this.opportunitiesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.opportunitiesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOpportunityDto) {
    return this.opportunitiesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.opportunitiesService.remove(id);
  }

  @Patch(':id/stage')
  changeStage(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeStageDto) {
    return this.opportunitiesService.changeStage(id, dto);
  }

  @Patch(':id/proposal')
  sendProposal(@Param('id', ParseIntPipe) id: number, @Body() dto: SendProposalDto) {
    return this.opportunitiesService.sendProposal(id, dto);
  }

  @Patch(':id/follow-up')
  setFollowUp(@Param('id', ParseIntPipe) id: number, @Body() dto: FollowUpDto) {
    return this.opportunitiesService.setFollowUp(id, dto);
  }

  @Patch(':id/win')
  win(@Param('id', ParseIntPipe) id: number) {
    return this.opportunitiesService.win(id);
  }

  @Patch(':id/lose')
  lose(@Param('id', ParseIntPipe) id: number, @Body() dto: LoseOpportunityDto) {
    return this.opportunitiesService.lose(id, dto);
  }
}
