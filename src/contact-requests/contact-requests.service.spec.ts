import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContactRequestsService } from './contact-requests.service';
import { ContactRequest } from './contact-request.entity';

describe('ContactRequestsService handle', () => {
  let service: ContactRequestsService;
  let repo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock; findAndCount: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ContactRequestsService,
        { provide: getRepositoryToken(ContactRequest), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(ContactRequestsService);
  });

  it('marks the request as handled sealing employee and timestamp', async () => {
    repo.findOne.mockResolvedValue({ id: 3, wasHandled: false });
    const result = await service.handle(3, { resultingClientId: 11 }, 7);
    expect(result.wasHandled).toBe(true);
    expect(result.handledByEmployeeId).toBe(7);
    expect(result.handledAt).toBeInstanceOf(Date);
    expect(result.resultingClientId).toBe(11);
    expect(repo.save).toHaveBeenCalled();
  });

  it('handles without resultingClientId', async () => {
    repo.findOne.mockResolvedValue({ id: 3, wasHandled: false });
    const result = await service.handle(3, {}, 7);
    expect(result.wasHandled).toBe(true);
    expect(result.resultingClientId).toBeUndefined();
  });

  it('throws NotFound when the request does not exist', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.handle(99, {}, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws Conflict when already handled', async () => {
    repo.findOne.mockResolvedValue({ id: 3, wasHandled: true });
    await expect(service.handle(3, {}, 7)).rejects.toBeInstanceOf(ConflictException);
  });
});
