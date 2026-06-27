import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpportunitiesService } from './opportunities.service';
import { Opportunity } from './opportunity.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';

type MockRepo<T extends object = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createMockRepo = (): MockRepo => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('OpportunitiesService', () => {
  let service: OpportunitiesService;
  let opportunityRepo: MockRepo;
  let pipelineStageRepo: MockRepo;

  beforeEach(async () => {
    opportunityRepo = createMockRepo();
    pipelineStageRepo = createMockRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        OpportunitiesService,
        { provide: getRepositoryToken(Opportunity), useValue: opportunityRepo },
        { provide: getRepositoryToken(PipelineStage), useValue: pipelineStageRepo },
      ],
    }).compile();
    service = moduleRef.get(OpportunitiesService);
  });

  describe('create', () => {
    it('persists a new opportunity and sets probability from stage', async () => {
      const dto: any = { clientId: 1, responsibleEmployeeId: 2, pipelineStageId: 3 };
      const stage = { id: 3, probability: 40 };
      const entity = { id: 10, ...dto, probability: 40 };
      pipelineStageRepo.findOne!.mockResolvedValue(stage);
      opportunityRepo.create!.mockReturnValue(entity);
      opportunityRepo.save!.mockResolvedValue(entity);
      opportunityRepo.findOne!.mockResolvedValue(entity);
      const result = await service.create(dto);
      expect(opportunityRepo.create).toHaveBeenCalledWith(expect.objectContaining({ probability: 40 }));
      expect(result).toEqual(entity);
    });
  });

  describe('findAll', () => {
    it('applies the followUpDue filter and returns the paginated shape', async () => {
      const qb: any = {
        leftJoin: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[{ id: 1 }], 1]),
      };
      opportunityRepo.createQueryBuilder!.mockReturnValue(qb);

      const result = await service.findAll({ page: 1, limit: 20, followUpDue: true });

      expect(qb.andWhere).toHaveBeenCalledWith('opportunity.nextFollowUpAt <= :now', {
        now: expect.any(Date),
      });
      expect(result).toEqual({ items: [{ id: 1 }], total: 1, page: 1, limit: 20 });
    });
  });
});
