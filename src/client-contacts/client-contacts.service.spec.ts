import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ClientContactsService } from './client-contacts.service';
import { ClientContact } from './client-contact.entity';

describe('ClientContactsService', () => {
  let service: ClientContactsService;
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
        ClientContactsService,
        { provide: getRepositoryToken(ClientContact), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(ClientContactsService);
  });

  it('creates a client contact and returns it', async () => {
    const dto = { name: 'John Doe', clientId: 1 };
    const saved = { id: 1, ...dto };
    repo.create.mockReturnValue(dto);
    repo.save.mockResolvedValue(saved);
    const result = await service.create(dto);
    expect(result).toEqual(saved);
  });

  it('returns paginated list without clientId filter', async () => {
    const contact = { id: 1, name: 'John Doe', clientId: 1 };
    repo.findAndCount.mockResolvedValue([[contact], 1]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result).toEqual({ items: [contact], total: 1, page: 1, limit: 20 });
    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('applies clientId filter when provided', async () => {
    const contact = { id: 2, name: 'Jane Smith', clientId: 5 };
    repo.findAndCount.mockResolvedValue([[contact], 1]);
    const result = await service.findAll({ page: 1, limit: 20, clientId: 5 });
    expect(result.items).toEqual([contact]);
    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: 5 } }),
    );
  });

  it('throws NotFoundException when the contact is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a client contact and returns it', async () => {
    const existing = { id: 1, name: 'John Doe', clientId: 1 };
    repo.findOne.mockResolvedValue(existing);
    repo.save.mockResolvedValue({ ...existing, name: 'John Updated' });
    const result = await service.update(1, { name: 'John Updated' });
    expect(result.name).toBe('John Updated');
  });

  it('removes a client contact and returns its id', async () => {
    const existing = { id: 1, name: 'John Doe', clientId: 1 };
    repo.findOne.mockResolvedValue(existing);
    repo.remove.mockResolvedValue(existing);
    const result = await service.remove(1);
    expect(result).toEqual({ id: 1 });
  });
});
