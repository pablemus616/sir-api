import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContactHistoryService } from './contact-history.service';
import { ContactHistory } from './contact-history.entity';
import { Opportunity } from '../opportunities/opportunity.entity';

describe('ContactHistoryService lastContactAt', () => {
  let service: ContactHistoryService;
  let historyRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock; createQueryBuilder: jest.Mock };
  let opportunityRepo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    historyRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 1, ...value })),
      findOne: jest.fn(async () => ({ id: 1 })),
      createQueryBuilder: jest.fn(),
    };
    opportunityRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactHistoryService,
        { provide: getRepositoryToken(ContactHistory), useValue: historyRepo },
        { provide: getRepositoryToken(Opportunity), useValue: opportunityRepo },
      ],
    }).compile();
    service = moduleRef.get(ContactHistoryService);
  });

  const baseDto = {
    contactId: 5,
    contactType: 2,
    contactTime: '2026-06-20T10:00:00.000Z',
    opportunityId: 9,
  };

  it('sets lastContactAt when opportunity has none', async () => {
    opportunityRepo.findOne.mockResolvedValue({ id: 9, lastContactAt: null });
    await service.create(baseDto as any, 7);
    expect(opportunityRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9, lastContactAt: new Date('2026-06-20T10:00:00.000Z') }),
    );
  });

  it('updates lastContactAt when contactTime is more recent', async () => {
    opportunityRepo.findOne.mockResolvedValue({ id: 9, lastContactAt: new Date('2026-06-10T10:00:00.000Z') });
    await service.create(baseDto as any, 7);
    expect(opportunityRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ lastContactAt: new Date('2026-06-20T10:00:00.000Z') }),
    );
  });

  it('does not update lastContactAt when contactTime is older', async () => {
    opportunityRepo.findOne.mockResolvedValue({ id: 9, lastContactAt: new Date('2026-06-25T10:00:00.000Z') });
    await service.create(baseDto as any, 7);
    expect(opportunityRepo.save).not.toHaveBeenCalled();
  });

  it('does not touch opportunity when opportunityId is absent', async () => {
    await service.create({ contactId: 5, contactType: 2, contactTime: '2026-06-20T10:00:00.000Z' } as any, 7);
    expect(opportunityRepo.findOne).not.toHaveBeenCalled();
    expect(opportunityRepo.save).not.toHaveBeenCalled();
  });

  it('throws when opportunity does not exist', async () => {
    opportunityRepo.findOne.mockResolvedValue(null);
    await expect(service.create(baseDto as any, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('seals employeeId from the current user', async () => {
    opportunityRepo.findOne.mockResolvedValue({ id: 9, lastContactAt: null });
    await service.create(baseDto as any, 7);
    expect(historyRepo.create).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 7 }));
  });
});
