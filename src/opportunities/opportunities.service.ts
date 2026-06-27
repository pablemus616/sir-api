import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Opportunity } from './opportunity.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { QueryOpportunityDto } from './dto/query-opportunity.dto';

@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(PipelineStage)
    private readonly pipelineStageRepository: Repository<PipelineStage>,
  ) {}

  async create(dto: CreateOpportunityDto): Promise<Opportunity> {
    const opportunity = this.opportunityRepository.create(dto);
    return this.opportunityRepository.save(opportunity);
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
    const opportunity = await this.opportunityRepository.findOne({ where: { id } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    return opportunity;
  }

  async update(id: number, dto: UpdateOpportunityDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    Object.assign(opportunity, dto);
    return this.opportunityRepository.save(opportunity);
  }

  async remove(id: number): Promise<void> {
    const opportunity = await this.findOne(id);
    await this.opportunityRepository.remove(opportunity);
  }
}
