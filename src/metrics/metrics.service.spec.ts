import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MetricsService } from './metrics.service';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactHistory } from '../contact-history/contact-history.entity';
import { ContactRequest } from '../contact-requests/contact-request.entity';
import { Application } from '../applications/application.entity';
import { Placement } from '../placements/placement.entity';
import { Client } from '../clients/client.entity';
import { Candidate } from '../candidates/candidate.entity';

function createQbMock() {
  const qb: any = {};
  const chain = [
    'leftJoin',
    'innerJoin',
    'select',
    'addSelect',
    'where',
    'andWhere',
    'groupBy',
    'addGroupBy',
    'orderBy',
    'addOrderBy',
  ];
  for (const m of chain) qb[m] = jest.fn().mockReturnValue(qb);
  qb.getRawOne = jest.fn();
  qb.getRawMany = jest.fn();
  qb.getCount = jest.fn();
  return qb;
}

describe('MetricsService', () => {
  let service: MetricsService;
  let opportunityRepo: any;
  let contactHistoryRepo: any;
  let contactRequestRepo: any;
  let applicationRepo: any;
  let placementRepo: any;
  let clientRepo: any;
  let candidateRepo: any;

  beforeEach(async () => {
    const repo = () => ({ createQueryBuilder: jest.fn(), count: jest.fn() });
    const module = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: getRepositoryToken(Opportunity), useValue: repo() },
        { provide: getRepositoryToken(ContactHistory), useValue: repo() },
        { provide: getRepositoryToken(ContactRequest), useValue: repo() },
        { provide: getRepositoryToken(Application), useValue: repo() },
        { provide: getRepositoryToken(Placement), useValue: repo() },
        { provide: getRepositoryToken(Client), useValue: repo() },
        { provide: getRepositoryToken(Candidate), useValue: repo() },
      ],
    }).compile();

    service = module.get(MetricsService);
    opportunityRepo = module.get(getRepositoryToken(Opportunity));
    contactHistoryRepo = module.get(getRepositoryToken(ContactHistory));
    contactRequestRepo = module.get(getRepositoryToken(ContactRequest));
    applicationRepo = module.get(getRepositoryToken(Application));
    placementRepo = module.get(getRepositoryToken(Placement));
    clientRepo = module.get(getRepositoryToken(Client));
    candidateRepo = module.get(getRepositoryToken(Candidate));
  });

  describe('commercial', () => {
    it('parses aggregates and computes conversion ratios', async () => {
      const qb = createQbMock();
      qb.getRawOne.mockResolvedValue({
        totalOpportunities: '10',
        totalWon: '3',
        proposalsSent: '4',
        proposalsAmount: '40000.00',
        wonValue: '30000.00',
        weightedValue: '12000.00',
      });
      opportunityRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.commercial({});

      expect(res.totalOpportunities).toBe(10);
      expect(res.totalWon).toBe(3);
      expect(res.proposalsSent).toBe(4);
      expect(res.proposalsAmount).toBe(40000);
      expect(res.wonValue).toBe(30000);
      expect(res.weightedValue).toBe(12000);
      expect(res.conversionWonTotal).toBeCloseTo(0.3);
      expect(res.conversionWonProposals).toBeCloseTo(0.75);
    });

    it('guards against division by zero and null sums', async () => {
      const qb = createQbMock();
      qb.getRawOne.mockResolvedValue({
        totalOpportunities: '0',
        totalWon: '0',
        proposalsSent: '0',
        proposalsAmount: null,
        wonValue: null,
        weightedValue: null,
      });
      opportunityRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.commercial({});

      expect(res.conversionWonTotal).toBe(0);
      expect(res.conversionWonProposals).toBe(0);
      expect(res.wonValue).toBe(0);
      expect(res.weightedValue).toBe(0);
    });
  });

  describe('overview', () => {
    it('aggregates snapshot counts and pipeline value', async () => {
      clientRepo.count.mockResolvedValue(7);
      candidateRepo.count.mockResolvedValue(9);
      contactRequestRepo.count.mockResolvedValue(2);

      // openOpportunities y pipelineValue ahora salen de sendos query builders
      // de opportunityRepo (1º getCount, 2º getRawOne); placements de placementRepo.
      const openOppQb = createQbMock();
      openOppQb.getCount.mockResolvedValue(5);
      const pipelineQb = createQbMock();
      pipelineQb.getRawOne.mockResolvedValue({ pipelineValue: '85000.00' });
      opportunityRepo.createQueryBuilder
        .mockReturnValueOnce(openOppQb)
        .mockReturnValueOnce(pipelineQb);

      const placementsQb = createQbMock();
      placementsQb.getCount.mockResolvedValue(3);
      placementRepo.createQueryBuilder.mockReturnValue(placementsQb);

      const res = await service.overview();

      expect(res.clients).toBe(7);
      expect(res.openOpportunities).toBe(5);
      expect(res.pipelineValue).toBe(85000);
      expect(res.activeCandidates).toBe(9);
      expect(res.placementsThisMonth).toBe(3);
      expect(res.pendingRequests).toBe(2);
    });
  });

  describe('pipeline', () => {
    it('maps stage rows parsing count and amount', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { stageId: '1', stageName: 'Contacto inicial', sortOrder: '1', count: '4', amount: '12000.00' },
        { stageId: '5', stageName: 'Propuesta enviada', sortOrder: '5', count: '2', amount: null },
      ]);
      opportunityRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.pipeline({});

      expect(res).toEqual([
        { stageId: 1, stageName: 'Contacto inicial', sortOrder: 1, count: 4, amount: 12000 },
        { stageId: 5, stageName: 'Propuesta enviada', sortOrder: 5, count: 2, amount: 0 },
      ]);
    });
  });

  describe('contacts', () => {
    it('aggregates call metrics by employee, type and direction', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        {
          employeeId: '2',
          contactTypeId: '1',
          contactTypeName: 'call',
          direction: 'outbound',
          count: '3',
          totalCallLength: '450',
          avgCallLength: '150.0000',
        },
        {
          employeeId: '2',
          contactTypeId: '2',
          contactTypeName: 'email',
          direction: 'inbound',
          count: '1',
          totalCallLength: null,
          avgCallLength: null,
        },
      ]);
      contactHistoryRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.contacts({ clientId: 9 });

      expect(qb.andWhere).toHaveBeenCalledWith('cc.clientId = :clientId', { clientId: 9 });
      expect(res[0]).toEqual({
        employeeId: 2,
        contactTypeId: 1,
        contactTypeName: 'call',
        direction: 'outbound',
        count: 3,
        totalCallLength: 450,
        avgCallLength: 150,
      });
      expect(res[1].totalCallLength).toBe(0);
      expect(res[1].avgCallLength).toBe(0);
    });
  });

  describe('requests', () => {
    it('computes handle rate, conversion rate and avg response', async () => {
      const qb = createQbMock();
      qb.getRawOne.mockResolvedValue({
        total: '8',
        handled: '6',
        converted: '2',
        avgResponseSeconds: '3600',
      });
      contactRequestRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.requests({});

      expect(res.total).toBe(8);
      expect(res.handled).toBe(6);
      expect(res.handleRate).toBeCloseTo(0.75);
      expect(res.converted).toBe(2);
      expect(res.conversionRate).toBeCloseTo(0.25);
      expect(res.avgResponseSeconds).toBe(3600);
    });

    it('returns zeros when there are no requests', async () => {
      const qb = createQbMock();
      qb.getRawOne.mockResolvedValue({
        total: '0',
        handled: '0',
        converted: '0',
        avgResponseSeconds: null,
      });
      contactRequestRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.requests({});

      expect(res.handleRate).toBe(0);
      expect(res.conversionRate).toBe(0);
      expect(res.avgResponseSeconds).toBe(0);
    });
  });

  describe('recruitmentFunnel', () => {
    it('counts applications by stage applying opportunity scope', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { stage: 'applied', count: '12' },
        { stage: 'interview', count: '4' },
        { stage: 'hired', count: '2' },
      ]);
      applicationRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.recruitmentFunnel({ clientId: 3 });

      expect(qb.andWhere).toHaveBeenCalledWith('o.clientId = :clientId', { clientId: 3 });
      expect(res).toEqual([
        { stage: 'applied', count: 12 },
        { stage: 'interview', count: 4 },
        { stage: 'hired', count: 2 },
      ]);
    });
  });

  describe('placements', () => {
    it('aggregates placements with fee and time-to-fill by recruiter/client', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { recruiterId: '4', clientId: '3', count: '2', totalFee: '5000.00', avgTimeToFillSeconds: '864000' },
        { recruiterId: '4', clientId: '7', count: '1', totalFee: null, avgTimeToFillSeconds: null },
      ]);
      placementRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.placements({});

      expect(res[0]).toEqual({
        recruiterId: 4,
        clientId: 3,
        count: 2,
        totalFee: 5000,
        avgTimeToFillSeconds: 864000,
      });
      expect(res[1].totalFee).toBe(0);
      expect(res[1].avgTimeToFillSeconds).toBe(0);
    });

    it('filters by recruiterId when provided', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { recruiterId: '4', clientId: '3', count: '2', totalFee: '5000.00', avgTimeToFillSeconds: '864000' },
      ]);
      placementRepo.createQueryBuilder.mockReturnValue(qb);

      await service.placements({ recruiterId: 4 });

      expect(qb.andWhere).toHaveBeenCalledWith('p.placedByEmployeeId = :recruiterId', { recruiterId: 4 });
    });
  });

  describe('charts', () => {
    it('chartByClient maps grouped totals', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { clientId: '3', clientName: 'Acme', opportunities: '6', won: '2', amount: '40000.00' },
        { clientId: '7', clientName: 'Globex', opportunities: '1', won: '0', amount: null },
      ]);
      opportunityRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.chartByClient({});

      expect(res[0]).toEqual({
        clientId: 3,
        clientName: 'Acme',
        opportunities: 6,
        won: 2,
        amount: 40000,
      });
      expect(res[1].amount).toBe(0);
    });

    it('chartBySector maps grouped totals with sector keys', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { sectorId: '1', sectorName: 'BPO', opportunities: '4', won: '1', amount: '15000.00' },
      ]);
      opportunityRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.chartBySector({ from: '2026-01-01' });

      expect(res[0]).toEqual({
        sectorId: 1,
        sectorName: 'BPO',
        opportunities: 4,
        won: 1,
        amount: 15000,
      });
    });

    it('chartByArea maps grouped totals with area keys', async () => {
      const qb = createQbMock();
      qb.getRawMany.mockResolvedValue([
        { areaId: '2', areaName: 'IT', opportunities: '3', won: '3', amount: '90000.00' },
      ]);
      opportunityRepo.createQueryBuilder.mockReturnValue(qb);

      const res = await service.chartByArea({});

      expect(res[0]).toEqual({
        areaId: 2,
        areaName: 'IT',
        opportunities: 3,
        won: 3,
        amount: 90000,
      });
    });
  });
});
