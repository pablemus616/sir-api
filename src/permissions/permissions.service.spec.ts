import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { Permission } from '../roles/permission.entity';

describe('PermissionsService', () => {
  let service: PermissionsService;
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((v) => v),
    save: jest.fn((v) => Promise.resolve({ id: 1, ...v })),
    findAndCount: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [PermissionsService, { provide: getRepositoryToken(Permission), useValue: repo }],
    }).compile();
    service = mod.get(PermissionsService);
  });

  it('creates when name is free', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.create({ name: 'clients.read' })).resolves.toEqual({ id: 1, name: 'clients.read' });
  });

  it('rejects a duplicate name', async () => {
    repo.findOne.mockResolvedValue({ id: 1, name: 'clients.read' });
    await expect(service.create({ name: 'clients.read' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('paginates the list', async () => {
    repo.findAndCount.mockResolvedValue([[{ id: 1, name: 'x' }], 1]);
    await expect(service.findAll({ page: 2, limit: 10 })).resolves.toEqual({ items: [{ id: 1, name: 'x' }], total: 1, page: 2, limit: 10 });
    expect(repo.findAndCount).toHaveBeenCalledWith({ skip: 10, take: 10 });
  });

  it('throws on missing id', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
