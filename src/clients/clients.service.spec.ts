import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { Client } from './client.entity';

describe('ClientsService', () => {
  let service: ClientsService;
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
        ClientsService,
        { provide: getRepositoryToken(Client), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(ClientsService);
  });

  it('creates a client and returns it', async () => {
    const dto = { name: 'Acme Corp' };
    const saved = { id: 1, ...dto };
    repo.create.mockReturnValue(dto);
    repo.save.mockResolvedValue(saved);
    const result = await service.create(dto);
    expect(result).toEqual(saved);
  });

  it('returns paginated list without sectorId filter', async () => {
    const client = { id: 1, name: 'Acme Corp' };
    repo.findAndCount.mockResolvedValue([[client], 1]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result).toEqual({ items: [client], total: 1, page: 1, limit: 20 });
    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('applies sectorId filter when provided', async () => {
    const client = { id: 2, name: 'Beta LLC', sectorId: 5 };
    repo.findAndCount.mockResolvedValue([[client], 1]);
    const result = await service.findAll({ page: 1, limit: 20, sectorId: 5 });
    expect(result.items).toEqual([client]);
    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sectorId: 5 } }),
    );
  });

  it('findOne loads contacts relation', async () => {
    const client = { id: 1, name: 'Acme', contacts: [{ id: 10 }] };
    repo.findOne.mockResolvedValue(client);
    const result = await service.findOne(1);
    expect(result.contacts).toEqual([{ id: 10 }]);
    expect(repo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ relations: { contacts: true } }),
    );
  });

  it('throws NotFoundException when the client is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a client and returns it', async () => {
    const existing = { id: 1, name: 'Acme', contacts: [] };
    repo.findOne.mockResolvedValue(existing);
    repo.save.mockResolvedValue({ ...existing, name: 'Acme Updated' });
    const result = await service.update(1, { name: 'Acme Updated' });
    expect(result.name).toBe('Acme Updated');
  });

  it('removes a client and returns its id', async () => {
    const existing = { id: 1, name: 'Acme', contacts: [] };
    repo.findOne.mockResolvedValue(existing);
    repo.remove.mockResolvedValue(existing);
    const result = await service.remove(1);
    expect(result).toEqual({ id: 1 });
  });
});
