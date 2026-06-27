import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SectorsService } from './sectors.service';
import { Sector } from './sector.entity';

describe('SectorsService', () => {
  let service: SectorsService;
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
        SectorsService,
        { provide: getRepositoryToken(Sector), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(SectorsService);
  });

  it('throws ConflictException when name already exists', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'BPO', active: true });
    await expect(service.create({ name: 'BPO' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns the standard paginated shape', async () => {
    repo.findAndCount.mockResolvedValue([[{ id: 1, name: 'BPO' }], 1]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result).toEqual({
      items: [{ id: 1, name: 'BPO' }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('throws NotFoundException when the sector is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
