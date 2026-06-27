import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PipelineStagesService } from './pipeline-stages.service';
import { PipelineStage } from './pipeline-stage.entity';

describe('PipelineStagesService', () => {
  let service: PipelineStagesService;
  let repo: Record<string, jest.Mock>;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PipelineStagesService,
        { provide: getRepositoryToken(PipelineStage), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(PipelineStagesService);
  });

  it('creates and saves a new pipeline stage', async () => {
    const dto = { name: 'Prospecting', sortOrder: 1, probability: 10 };
    const created = { id: 1, ...dto, isWon: false, isLost: false, active: true };
    repo.create.mockReturnValue(created);
    repo.save.mockResolvedValue(created);
    const result = await service.create(dto);
    expect(repo.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(created);
  });

  it('returns the standard paginated shape without active filter', async () => {
    const stage = { id: 1, name: 'Prospecting', sortOrder: 1, probability: 10, isWon: false, isLost: false, active: true };
    repo.findAndCount.mockResolvedValue([[stage], 1]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result).toEqual({ items: [stage], total: 1, page: 1, limit: 20 });
    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('filters by active=true when provided', async () => {
    const stage = { id: 1, name: 'Prospecting', sortOrder: 1, probability: 10, isWon: false, isLost: false, active: true };
    repo.findAndCount.mockResolvedValue([[stage], 1]);
    const result = await service.findAll({ page: 1, limit: 20, active: true });
    expect(result).toEqual({ items: [stage], total: 1, page: 1, limit: 20 });
    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
  });

  it('filters by active=false when provided', async () => {
    repo.findAndCount.mockResolvedValue([[], 0]);
    const result = await service.findAll({ page: 1, limit: 20, active: false });
    expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: false } }),
    );
  });

  it('throws NotFoundException when the pipeline stage is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates an existing pipeline stage', async () => {
    const existing = { id: 1, name: 'Prospecting', sortOrder: 1, probability: 10, isWon: false, isLost: false, active: true };
    repo.findOne.mockResolvedValue(existing);
    repo.save.mockResolvedValue({ ...existing, name: 'Qualified' });
    const result = await service.update(1, { name: 'Qualified' });
    expect(result).toEqual({ ...existing, name: 'Qualified' });
  });

  it('removes an existing pipeline stage and returns its id', async () => {
    const existing = { id: 1, name: 'Prospecting', sortOrder: 1, probability: 10, isWon: false, isLost: false, active: true };
    repo.findOne.mockResolvedValue(existing);
    repo.remove.mockResolvedValue(undefined);
    const result = await service.remove(1);
    expect(result).toEqual({ id: 1 });
  });
});
