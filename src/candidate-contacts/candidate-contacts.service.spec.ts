// src/candidate-contacts/candidate-contacts.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CandidateContactsService } from './candidate-contacts.service';
import { CandidateContact } from './candidate-contact.entity';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactType } from '../contact-types/contact-type.entity';

describe('CandidateContactsService', () => {
  let service: CandidateContactsService;
  let repo: any;
  let candidateRepo: any;
  let opportunityRepo: any;
  let contactTypeRepo: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 99 })),
      findOne: jest.fn(async () => ({ id: 99 })),
      createQueryBuilder: jest.fn(),
    };
    candidateRepo = { findOne: jest.fn(async () => ({ id: 1 })) };
    opportunityRepo = { findOne: jest.fn(async () => ({ id: 2, lastContactAt: null })), save: jest.fn(async (x) => x) };
    contactTypeRepo = { findOne: jest.fn(async () => ({ id: 3 })) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CandidateContactsService,
        { provide: getRepositoryToken(CandidateContact), useValue: repo },
        { provide: getRepositoryToken(Candidate), useValue: candidateRepo },
        { provide: getRepositoryToken(Opportunity), useValue: opportunityRepo },
        { provide: getRepositoryToken(ContactType), useValue: contactTypeRepo },
      ],
    }).compile();
    service = moduleRef.get(CandidateContactsService);
  });

  it('create() sella el recruiter del token y NO usa ningún recruiter del dto', async () => {
    await service.create(
      { candidateId: 1, opportunityId: 2, contactType: 3, contactTime: '2026-06-28T10:00:00.000Z' } as any,
      7,
    );
    const built = repo.create.mock.calls[0][0];
    expect(built.recruiterEmployeeId).toBe(7);
    expect(built.candidateId).toBe(1);
    expect(built.opportunityId).toBe(2);
    expect(built.contactType).toEqual({ id: 3 });
  });

  it('create() lanza 404 si el candidato no existe', async () => {
    candidateRepo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.create({ candidateId: 1, opportunityId: 2, contactType: 3, contactTime: '2026-06-28T10:00:00.000Z' } as any, 7),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create() lanza 404 si la oportunidad no existe', async () => {
    opportunityRepo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.create({ candidateId: 1, opportunityId: 2, contactType: 3, contactTime: '2026-06-28T10:00:00.000Z' } as any, 7),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create() lanza 404 si el contactType no existe', async () => {
    contactTypeRepo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.create({ candidateId: 1, opportunityId: 2, contactType: 999, contactTime: '2026-06-28T10:00:00.000Z' } as any, 7),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('findAll() aplica filtros candidateId/opportunityId/recruiterId y pagina', async () => {
    const qb: any = {
      leftJoinAndSelect: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getManyAndCount: jest.fn(async () => [[], 0]),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
    const res = await service.findAll({ candidateId: 1, opportunityId: 2, recruiterId: 7, page: 1, limit: 20 } as any);
    expect(qb.andWhere).toHaveBeenCalledWith('cc.candidateId = :candidateId', { candidateId: 1 });
    expect(qb.andWhere).toHaveBeenCalledWith('cc.opportunityId = :opportunityId', { opportunityId: 2 });
    expect(qb.andWhere).toHaveBeenCalledWith('cc.recruiterEmployeeId = :recruiterId', { recruiterId: 7 });
    expect(res).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });
});
