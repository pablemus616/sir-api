import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from './opportunity.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { QueryOpportunityDto } from './dto/query-opportunity.dto';
import { ChangeStageDto } from './dto/change-stage.dto';
import { LoseOpportunityDto } from './dto/lose-opportunity.dto';
import { OpportunityStatus } from '../config/enums';

@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(PipelineStage)
    private readonly pipelineStageRepository: Repository<PipelineStage>,
  ) {}

  async create(dto: CreateOpportunityDto): Promise<Opportunity> {
    const stage = await this.pipelineStageRepository.findOne({ where: { id: dto.pipelineStageId } });
    if (!stage) throw new NotFoundException('Pipeline stage not found');
    const opportunity = this.opportunityRepository.create({ ...dto, probability: stage.probability });
    const saved = await this.opportunityRepository.save(opportunity);
    return this.findOne(saved.id);
  }

  async findAll(query: QueryOpportunityDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.opportunityRepository.createQueryBuilder('opportunity');

    if (query.sectorId !== undefined) {
      qb.leftJoin('opportunity.client', 'client').andWhere(
        'client.sectorId = :sectorId',
        { sectorId: query.sectorId },
      );
    }
    if (query.clientId !== undefined) {
      qb.andWhere('opportunity.clientId = :clientId', { clientId: query.clientId });
    }
    if (query.areaId !== undefined) {
      qb.andWhere('opportunity.areaId = :areaId', { areaId: query.areaId });
    }
    if (query.stageId !== undefined) {
      qb.andWhere('opportunity.pipelineStageId = :stageId', { stageId: query.stageId });
    }
    if (query.status !== undefined) {
      qb.andWhere('opportunity.status = :status', { status: query.status });
    }
    if (query.responsibleEmployeeId !== undefined) {
      qb.andWhere('opportunity.responsibleEmployeeId = :responsibleEmployeeId', {
        responsibleEmployeeId: query.responsibleEmployeeId,
      });
    }
    if (query.followUpDue) {
      qb.andWhere('opportunity.nextFollowUpAt <= :now', { now: new Date() });
    }

    qb.orderBy('opportunity.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
      relations: { client: true, area: true, responsibleEmployee: true, clientContact: true, pipelineStage: true },
    });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    return opportunity;
  }

  async update(id: number, dto: UpdateOpportunityDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    Object.assign(opportunity, dto);
    return this.opportunityRepository.save(opportunity);
  }

  async changeStage(id: number, dto: ChangeStageDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    const stage = await this.pipelineStageRepository.findOne({
      where: { id: dto.pipelineStageId },
    });
    if (!stage) {
      throw new NotFoundException('Pipeline stage not found');
    }
    if (!stage.active) {
      throw new BadRequestException('Pipeline stage is not active');
    }
    opportunity.pipelineStageId = stage.id;
    opportunity.probability = dto.probability ?? stage.probability;
    if (stage.isWon) {
      opportunity.status = OpportunityStatus.WON;
      opportunity.wonAt = new Date();
    }
    if (stage.isLost) {
      opportunity.status = OpportunityStatus.LOST;
      opportunity.lostAt = new Date();
      if (dto.lostReason !== undefined) {
        opportunity.lostReason = dto.lostReason;
      }
    }
    await this.opportunityRepository.save(opportunity);
    return this.findOne(id);
  }

  async win(id: number): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    const stage = await this.pipelineStageRepository.findOne({ where: { isWon: true, active: true } });
    if (!stage) throw new BadRequestException('No active won stage configured');
    opportunity.status = OpportunityStatus.WON;
    opportunity.wonAt = new Date();
    opportunity.pipelineStageId = stage.id;
    opportunity.probability = stage.probability;
    await this.opportunityRepository.save(opportunity);
    return this.findOne(id);
  }

  async lose(id: number, dto: LoseOpportunityDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    const stage = await this.pipelineStageRepository.findOne({ where: { isLost: true, active: true } });
    if (!stage) throw new BadRequestException('No active lost stage configured');
    opportunity.status = OpportunityStatus.LOST;
    opportunity.lostAt = new Date();
    if (dto.lostReason !== undefined) {
      opportunity.lostReason = dto.lostReason;
    }
    opportunity.pipelineStageId = stage.id;
    opportunity.probability = stage.probability;
    await this.opportunityRepository.save(opportunity);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const opportunity = await this.findOne(id);
    await this.opportunityRepository.remove(opportunity);
  }
}
