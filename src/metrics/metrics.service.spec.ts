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
});
