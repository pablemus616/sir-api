import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Placement } from './placement.entity';
import { Application } from '../applications/application.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { CreatePlacementDto } from './dto/create-placement.dto';
import { UpdatePlacementDto } from './dto/update-placement.dto';
import { SearchPlacementsDto } from './dto/search-placements.dto';
import { ApplicationStage, OpportunityStatus, PlacementStatus } from '../config/enums';
import { type AuthUser } from '../config/current-user.decorator';

@Injectable()
export class PlacementsService {
  constructor(
    @InjectRepository(Placement)
    private readonly placementsRepository: Repository<Placement>,
    @InjectRepository(Application)
    private readonly applicationsRepository: Repository<Application>,
    @InjectRepository(Opportunity)
    private readonly opportunitiesRepository: Repository<Opportunity>,
  ) {}

  async create(dto: CreatePlacementDto, user: AuthUser): Promise<Placement> {
    const application = await this.applicationsRepository.findOne({
      where: { id: dto.applicationId },
    });
    if (!application) {
      throw new NotFoundException(`Application ${dto.applicationId} not found`);
    }

    application.stage = ApplicationStage.HIRED;
    await this.applicationsRepository.save(application);

    const placement = this.placementsRepository.create({
      applicationId: application.id,
      candidateId: application.candidateId,
      opportunityId: application.opportunityId,
      placedByEmployeeId: user.employeeId,
      placementDate: dto.placementDate,
      startDate: dto.startDate,
      endDate: dto.endDate,
      endReason: dto.endReason,
      agreedSalary: dto.agreedSalary,
      fee: dto.fee,
      status: dto.status,
    });
    const saved = await this.placementsRepository.save(placement);

    const opportunity = await this.opportunitiesRepository.findOne({
      where: { id: application.opportunityId },
    });
    if (opportunity) {
      const activeCount = await this.placementsRepository.count({
        where: { opportunityId: opportunity.id, status: PlacementStatus.ACTIVE },
      });
      if (activeCount >= opportunity.headcount) {
        opportunity.status = OpportunityStatus.WON;
        opportunity.wonAt = new Date();
        await this.opportunitiesRepository.save(opportunity);
      }
    }

    return saved;
  }

  async findAll(query: SearchPlacementsDto): Promise<{
    items: Placement[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, clientId, recruiterId, status, from, to } = query;
    const qb = this.placementsRepository
      .createQueryBuilder('placement')
      .leftJoinAndSelect('placement.opportunity', 'opportunity')
      .leftJoinAndSelect('placement.candidate', 'candidate');
    if (clientId) qb.andWhere('opportunity.clientId = :clientId', { clientId });
    if (recruiterId)
      qb.andWhere('placement.placedByEmployeeId = :recruiterId', { recruiterId });
    if (status) qb.andWhere('placement.status = :status', { status });
    if (from) qb.andWhere('placement.placementDate >= :from', { from });
    if (to) qb.andWhere('placement.placementDate <= :to', { to });
    qb.orderBy('placement.placementDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Placement> {
    const placement = await this.placementsRepository.findOne({
      where: { id },
      relations: { application: true, candidate: true, opportunity: true },
    });
    if (!placement) throw new NotFoundException(`Placement ${id} not found`);
    return placement;
  }

  async update(id: number, dto: UpdatePlacementDto): Promise<Placement> {
    const placement = await this.findOne(id);
    Object.assign(placement, dto);
    await this.placementsRepository.save(placement);
    return this.findOne(id);
  }
}
