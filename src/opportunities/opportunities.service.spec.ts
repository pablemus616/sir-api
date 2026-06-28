import { BadRequestException, NotFoundException } from '@nestjs/common';
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
        leftJoinAndSelect: jest.fn().mockReturnThis(),
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

  describe('changeStage', () => {
    beforeEach(() => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, status: 'open' });
      opportunityRepo.save!.mockImplementation(async (o: any) => {
        opportunityRepo.findOne!.mockResolvedValue(o);
        return o;
      });
    });

    it('takes the probability from the stage when no override is given', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 5, probability: 40, active: true, isWon: false, isLost: false,
      });
      const result = await service.changeStage(1, { pipelineStageId: 5 });
      expect(result.pipelineStageId).toBe(5);
      expect(result.probability).toBe(40);
    });

    it('honors an explicit probability override from the body', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 5, probability: 40, active: true, isWon: false, isLost: false,
      });
      const result = await service.changeStage(1, { pipelineStageId: 5, probability: 55 });
      expect(result.probability).toBe(55);
    });

    it('marks the opportunity as won when the stage is a won stage', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 9, probability: 100, active: true, isWon: true, isLost: false,
      });
      const result = await service.changeStage(1, { pipelineStageId: 9 });
      expect(result.status).toBe('won');
      expect(result.wonAt).toBeInstanceOf(Date);
    });

    it('marks the opportunity as lost and stores the reason for a lost stage', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 10, probability: 0, active: true, isWon: false, isLost: true,
      });
      const result = await service.changeStage(1, { pipelineStageId: 10, lostReason: 'budget' });
      expect(result.status).toBe('lost');
      expect(result.lostAt).toBeInstanceOf(Date);
      expect(result.lostReason).toBe('budget');
    });

    it('rejects an inactive stage with BadRequestException', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 7, probability: 30, active: false, isWon: false, isLost: false,
      });
      await expect(service.changeStage(1, { pipelineStageId: 7 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the stage does not exist', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue(null);
      await expect(service.changeStage(1, { pipelineStageId: 99 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('treats probability 0 as an explicit override, not falsy', async () => {
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 5, probability: 40, active: true, isWon: false, isLost: false,
      });
      const result = await service.changeStage(1, { pipelineStageId: 5, probability: 0 });
      expect(result.probability).toBe(0);
    });
  });

  describe('win', () => {
    it('sets status won, stamps wonAt and moves to the won stage', async () => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, status: 'open' });
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 9, probability: 100, isWon: true, active: true,
      });
      opportunityRepo.save!.mockImplementation(async (o: any) => {
        opportunityRepo.findOne!.mockResolvedValue(o);
        return o;
      });
      const result = await service.win(1);
      expect(result.status).toBe('won');
      expect(result.wonAt).toBeInstanceOf(Date);
      expect(result.pipelineStageId).toBe(9);
      expect(result.probability).toBe(100);
    });

    it('throws BadRequestException when no active won stage is configured', async () => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, status: 'open' });
      pipelineStageRepo.findOne!.mockResolvedValue(null);
      await expect(service.win(1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('lose', () => {
    it('sets status lost, stamps lostAt, stores reason and moves to the lost stage', async () => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, status: 'open' });
      pipelineStageRepo.findOne!.mockResolvedValue({
        id: 10, probability: 0, isLost: true, active: true,
      });
      opportunityRepo.save!.mockImplementation(async (o: any) => {
        opportunityRepo.findOne!.mockResolvedValue(o);
        return o;
      });
      const result = await service.lose(1, { lostReason: 'no budget' });
      expect(result.status).toBe('lost');
      expect(result.lostAt).toBeInstanceOf(Date);
      expect(result.lostReason).toBe('no budget');
      expect(result.pipelineStageId).toBe(10);
    });

    it('throws BadRequestException when no active lost stage is configured', async () => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, status: 'open' });
      pipelineStageRepo.findOne!.mockResolvedValue(null);
      await expect(service.lose(1, { lostReason: 'budget' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('sendProposal', () => {
    it('stamps proposalSentAt when null and stores the amount', async () => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, proposalSentAt: null });
      opportunityRepo.save!.mockImplementation(async (o: any) => {
        opportunityRepo.findOne!.mockResolvedValue(o);
        return o;
      });
      const result = await service.sendProposal(1, { amount: 12000 });
      expect(result.proposalSentAt).toBeInstanceOf(Date);
      expect(result.amount).toBe(12000);
    });

    it('keeps the original proposalSentAt when already set', async () => {
      const existing = new Date('2026-01-01T00:00:00.000Z');
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, proposalSentAt: existing });
      opportunityRepo.save!.mockImplementation(async (o: any) => {
        opportunityRepo.findOne!.mockResolvedValue(o);
        return o;
      });
      const result = await service.sendProposal(1, { amount: 9000 });
      expect(result.proposalSentAt).toBe(existing);
      expect(result.amount).toBe(9000);
    });

    it('leaves amount unchanged when dto.amount is not provided', async () => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1, proposalSentAt: null, amount: 5000 });
      opportunityRepo.save!.mockImplementation(async (o: any) => {
        opportunityRepo.findOne!.mockResolvedValue(o);
        return o;
      });
      const result = await service.sendProposal(1, {});
      expect(result.amount).toBe(5000);
    });

    it('throws NotFoundException when opportunity does not exist', async () => {
      opportunityRepo.findOne!.mockResolvedValue(null);
      await expect(service.sendProposal(1, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('setFollowUp', () => {
    it('stores the next follow up date', async () => {
      opportunityRepo.findOne!.mockResolvedValue({ id: 1 });
      opportunityRepo.save!.mockImplementation(async (o: any) => {
        opportunityRepo.findOne!.mockResolvedValue(o);
        return o;
      });
      const next = new Date('2026-07-01T00:00:00.000Z');
      const result = await service.setFollowUp(1, { nextFollowUpAt: next });
      expect(result.nextFollowUpAt).toBe(next);
    });

    it('throws NotFoundException when opportunity does not exist', async () => {
      opportunityRepo.findOne!.mockResolvedValue(null);
      const next = new Date('2026-07-01T00:00:00.000Z');
      await expect(service.setFollowUp(1, { nextFollowUpAt: next })).rejects.toThrow(NotFoundException);
    });
  });
});
