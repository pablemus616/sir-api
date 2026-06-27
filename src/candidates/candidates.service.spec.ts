import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CandidatesService } from './candidates.service';
import { Candidate } from './candidate.entity';

describe('CandidatesService', () => {
  let service: CandidatesService;
  let repository: jest.Mocked<Repository<Candidate>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        {
          provide: getRepositoryToken(Candidate),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            delete: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(CandidatesService);
    repository = module.get(getRepositoryToken(Candidate));
  });

  it('findOne throws NotFoundException when candidate is missing', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
  });

  it('findOne returns candidate loading the applications relation', async () => {
    const candidate = { id: 1, applications: [] } as unknown as Candidate;
    repository.findOne.mockResolvedValue(candidate);
    const result = await service.findOne(1);
    expect(result).toBe(candidate);
    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: { applications: true },
    });
  });
});
