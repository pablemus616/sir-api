import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ContactTypesService } from './contact-types.service';
import { ContactType } from './contact-type.entity';

describe('ContactTypesService', () => {
  let service: ContactTypesService;
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
        ContactTypesService,
        { provide: getRepositoryToken(ContactType), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(ContactTypesService);
  });

  it('creates and saves a new contact type', async () => {
    const dto = { name: 'Client' };
    const created = { id: 1, name: 'Client' };
    repo.create.mockReturnValue(created);
    repo.save.mockResolvedValue(created);
    const result = await service.create(dto);
    expect(repo.create).toHaveBeenCalledWith(dto);
    expect(result).toEqual(created);
  });

  it('returns the standard paginated shape', async () => {
    repo.findAndCount.mockResolvedValue([[{ id: 1, name: 'Client' }], 1]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result).toEqual({
      items: [{ id: 1, name: 'Client' }],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('throws NotFoundException when the contact type is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates an existing contact type', async () => {
    const existing = { id: 1, name: 'Client' };
    repo.findOne.mockResolvedValue(existing);
    repo.save.mockResolvedValue({ id: 1, name: 'Partner' });
    const result = await service.update(1, { name: 'Partner' });
    expect(result).toEqual({ id: 1, name: 'Partner' });
  });

  it('removes an existing contact type and returns its id', async () => {
    const existing = { id: 1, name: 'Client' };
    repo.findOne.mockResolvedValue(existing);
    repo.remove.mockResolvedValue(undefined);
    const result = await service.remove(1);
    expect(result).toEqual({ id: 1 });
  });
});
