import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { ApplicationsService } from './applications.service';
import { Application } from './application.entity';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let repository: jest.Mocked<Repository<Application>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        {
          provide: getRepositoryToken(Application),
          useValue: {
            create: jest.fn((dto) => dto),
            save: jest.fn((entity) => Promise.resolve(entity)),
            findOne: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ApplicationsService);
    repository = module.get(getRepositoryToken(Application));
  });

  it('create throws ConflictException when candidate already applied to opportunity', async () => {
    repository.findOne.mockResolvedValue({ id: 1 } as Application);
    await expect(
      service.create({ candidateId: 1, opportunityId: 2 } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('create persists application when pair is unique', async () => {
    repository.findOne.mockResolvedValue(null);
    const result = await service.create({ candidateId: 1, opportunityId: 2 } as any);
    expect(result).toEqual({ candidateId: 1, opportunityId: 2 });
  });

  it.each([
    ['applied', 'screening'],
    ['screening', 'interview'],
    ['interview', 'offer'],
    ['offer', 'hired'],
    ['applied', 'rejected'],
    ['screening', 'withdrawn'],
    ['interview', 'rejected'],
    ['offer', 'withdrawn'],
  ])('changeStage allows %s -> %s', async (from, to) => {
    repository.findOne.mockResolvedValue({ id: 1, stage: from } as Application);
    const result = await service.changeStage(1, { stage: to } as any);
    expect(result.stage).toBe(to);
  });

  it.each([
    ['applied', 'interview'],
    ['applied', 'hired'],
    ['screening', 'offer'],
    ['interview', 'hired'],
    ['hired', 'offer'],
    ['rejected', 'screening'],
    ['withdrawn', 'applied'],
    ['offer', 'applied'],
  ])('changeStage rejects %s -> %s', async (from, to) => {
    repository.findOne.mockResolvedValue({ id: 1, stage: from } as Application);
    await expect(
      service.changeStage(1, { stage: to } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('changeStage throws NotFoundException when application is missing', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(
      service.changeStage(1, { stage: 'screening' } as any),
    ).rejects.toThrow(NotFoundException);
  });
});
