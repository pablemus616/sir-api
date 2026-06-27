import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactHistory } from '../contact-history/contact-history.entity';
import { ContactRequest } from '../contact-requests/contact-request.entity';
import { Application } from '../applications/application.entity';
import { Placement } from '../placements/placement.entity';
import { Client } from '../clients/client.entity';
import { Candidate } from '../candidates/candidate.entity';
import { MetricsFilterDto } from './dto/metrics-filter.dto';

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepo: Repository<Opportunity>,
    @InjectRepository(ContactHistory)
    private readonly contactHistoryRepo: Repository<ContactHistory>,
    @InjectRepository(ContactRequest)
    private readonly contactRequestRepo: Repository<ContactRequest>,
    @InjectRepository(Application)
    private readonly applicationRepo: Repository<Application>,
    @InjectRepository(Placement)
    private readonly placementRepo: Repository<Placement>,
    @InjectRepository(Client)
    private readonly clientRepo: Repository<Client>,
    @InjectRepository(Candidate)
    private readonly candidateRepo: Repository<Candidate>,
  ) {}

  private applyOpportunityScope(
    qb: SelectQueryBuilder<any>,
    filter: MetricsFilterDto,
    oAlias = 'o',
    cAlias = 'c',
  ): SelectQueryBuilder<any> {
    if (filter.clientId) {
      qb.andWhere(`${oAlias}.clientId = :clientId`, { clientId: filter.clientId });
    }
    if (filter.areaId) {
      qb.andWhere(`${oAlias}.areaId = :areaId`, { areaId: filter.areaId });
    }
    if (filter.responsibleEmployeeId) {
      qb.andWhere(`${oAlias}.responsibleEmployeeId = :responsibleEmployeeId`, {
        responsibleEmployeeId: filter.responsibleEmployeeId,
      });
    }
    if (filter.stageId) {
      qb.andWhere(`${oAlias}.pipelineStageId = :stageId`, { stageId: filter.stageId });
    }
    if (filter.status) {
      qb.andWhere(`${oAlias}.status = :status`, { status: filter.status });
    }
    if (filter.sectorId) {
      qb.andWhere(`${cAlias}.sectorId = :sectorId`, { sectorId: filter.sectorId });
    }
    return qb;
  }

  private applyDateRange(
    qb: SelectQueryBuilder<any>,
    filter: MetricsFilterDto,
    column: string,
  ): SelectQueryBuilder<any> {
    if (filter.from) {
      qb.andWhere(`${column} >= :from`, { from: filter.from });
    }
    if (filter.to) {
      qb.andWhere(`${column} <= :to`, { to: filter.to });
    }
    return qb;
  }

  async commercial(filter: MetricsFilterDto) {
    const qb = this.opportunityRepo
      .createQueryBuilder('o')
      .leftJoin('o.client', 'c')
      .select('COUNT(o.id)', 'totalOpportunities')
      .addSelect(`SUM(CASE WHEN o.status = 'won' THEN 1 ELSE 0 END)`, 'totalWon')
      .addSelect(
        `SUM(CASE WHEN o.proposalSentAt IS NOT NULL THEN 1 ELSE 0 END)`,
        'proposalsSent',
      )
      .addSelect(
        `SUM(CASE WHEN o.proposalSentAt IS NOT NULL THEN o.amount ELSE 0 END)`,
        'proposalsAmount',
      )
      .addSelect(`SUM(CASE WHEN o.status = 'won' THEN o.amount ELSE 0 END)`, 'wonValue')
      .addSelect(
        `SUM(CASE WHEN o.status = 'open' THEN o.amount * o.probability / 100 ELSE 0 END)`,
        'weightedValue',
      );
    this.applyOpportunityScope(qb, filter);
    this.applyDateRange(qb, filter, 'o.createdAt');
    const raw = await qb.getRawOne();
    const totalOpportunities = Number(raw.totalOpportunities) || 0;
    const totalWon = Number(raw.totalWon) || 0;
    const proposalsSent = Number(raw.proposalsSent) || 0;
    const proposalsAmount = Number(raw.proposalsAmount) || 0;
    const wonValue = Number(raw.wonValue) || 0;
    const weightedValue = Number(raw.weightedValue) || 0;
    return {
      totalOpportunities,
      totalWon,
      conversionWonTotal: totalOpportunities > 0 ? totalWon / totalOpportunities : 0,
      conversionWonProposals: proposalsSent > 0 ? totalWon / proposalsSent : 0,
      proposalsSent,
      proposalsAmount,
      wonValue,
      weightedValue,
    };
  }

  async overview() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [clients, openOpportunities, activeCandidates, pendingRequests] =
      await Promise.all([
        this.clientRepo.count(),
        this.opportunityRepo.count({ where: { status: 'open' } as any }),
        this.candidateRepo.count({ where: { status: 'active' } as any }),
        this.contactRequestRepo.count({ where: { wasHandled: false } }),
      ]);
    const placementsThisMonth = await this.placementRepo
      .createQueryBuilder('p')
      .where('p.placementDate >= :monthStart', { monthStart })
      .andWhere('p.placementDate < :monthEnd', { monthEnd })
      .getCount();
    const pipelineRaw = await this.opportunityRepo
      .createQueryBuilder('o')
      .select('SUM(o.amount)', 'pipelineValue')
      .where(`o.status = 'open'`)
      .getRawOne();
    return {
      clients,
      openOpportunities,
      pipelineValue: Number(pipelineRaw.pipelineValue) || 0,
      activeCandidates,
      placementsThisMonth,
      pendingRequests,
    };
  }

  async pipeline(filter: MetricsFilterDto) {
    const qb = this.opportunityRepo
      .createQueryBuilder('o')
      .leftJoin('o.client', 'c')
      .innerJoin('o.pipelineStage', 's')
      .select('s.id', 'stageId')
      .addSelect('s.name', 'stageName')
      .addSelect('s.sortOrder', 'sortOrder')
      .addSelect('COUNT(o.id)', 'count')
      .addSelect('SUM(o.amount)', 'amount')
      .groupBy('s.id')
      .addGroupBy('s.name')
      .addGroupBy('s.sortOrder')
      .orderBy('s.sortOrder', 'ASC');
    this.applyOpportunityScope(qb, filter);
    this.applyDateRange(qb, filter, 'o.createdAt');
    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      stageId: Number(r.stageId),
      stageName: r.stageName,
      sortOrder: Number(r.sortOrder),
      count: Number(r.count) || 0,
      amount: Number(r.amount) || 0,
    }));
  }

  async contacts(filter: MetricsFilterDto) {
    const qb = this.contactHistoryRepo
      .createQueryBuilder('ch')
      .leftJoin('ch.contactType', 'ct')
      .leftJoin('ch.contact', 'cc')
      .select('ch.employeeId', 'employeeId')
      .addSelect('ct.id', 'contactTypeId')
      .addSelect('ct.name', 'contactTypeName')
      .addSelect('ch.direction', 'direction')
      .addSelect('COUNT(ch.id)', 'count')
      .addSelect('SUM(ch.callLength)', 'totalCallLength')
      .addSelect('AVG(ch.callLength)', 'avgCallLength')
      .groupBy('ch.employeeId')
      .addGroupBy('ct.id')
      .addGroupBy('ct.name')
      .addGroupBy('ch.direction');
    if (filter.clientId) {
      qb.andWhere('cc.clientId = :clientId', { clientId: filter.clientId });
    }
    this.applyDateRange(qb, filter, 'ch.contactTime');
    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      employeeId: Number(r.employeeId),
      contactTypeId: r.contactTypeId === null ? null : Number(r.contactTypeId),
      contactTypeName: r.contactTypeName,
      direction: r.direction,
      count: Number(r.count) || 0,
      totalCallLength: Number(r.totalCallLength) || 0,
      avgCallLength: r.avgCallLength === null ? 0 : Number(r.avgCallLength),
    }));
  }

  async requests(filter: MetricsFilterDto) {
    const qb = this.contactRequestRepo
      .createQueryBuilder('cr')
      .select('COUNT(cr.id)', 'total')
      .addSelect(`SUM(CASE WHEN cr.wasHandled = true THEN 1 ELSE 0 END)`, 'handled')
      .addSelect(
        `SUM(CASE WHEN cr.resultingClientId IS NOT NULL THEN 1 ELSE 0 END)`,
        'converted',
      )
      .addSelect(
        `AVG(CASE WHEN cr.handledAt IS NOT NULL THEN EXTRACT(EPOCH FROM (cr.handledAt - cr.createdAt)) END)`,
        'avgResponseSeconds',
      );
    this.applyDateRange(qb, filter, 'cr.createdAt');
    const raw = await qb.getRawOne();
    const total = Number(raw.total) || 0;
    const handled = Number(raw.handled) || 0;
    const converted = Number(raw.converted) || 0;
    return {
      total,
      handled,
      handleRate: total > 0 ? handled / total : 0,
      converted,
      conversionRate: total > 0 ? converted / total : 0,
      avgResponseSeconds:
        raw.avgResponseSeconds === null ? 0 : Number(raw.avgResponseSeconds),
    };
  }
}
