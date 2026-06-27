import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PositionAreasService } from './position-areas.service';
import { PositionArea } from './position-area.entity';

describe('PositionAreasService', () => {
  let service: PositionAreasService;
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
        PositionAreasService,
        { provide: getRepositoryToken(PositionArea), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(PositionAreasService);
  });

  it('throws ConflictException when name already exists', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'Engineering', active: true });
    await expect(
      service.create({ name: 'Engineering' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns the standard paginated shape', async () => {
    repo.findAndCount.mockResolvedValue([
      [{ id: 1, name: 'Engineering' }],
      1,
    ]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result).toEqual({
      items: [{ id: 1, name: 'Engineering' }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('throws NotFoundException when the position area is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
