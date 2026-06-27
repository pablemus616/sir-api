import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { Employee } from './employee.entity';

describe('EmployeesService', () => {
  let service: EmployeesService;
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
        EmployeesService,
        { provide: getRepositoryToken(Employee), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(EmployeesService);
  });

  it('creates an employee and returns it', async () => {
    const dto = { firstName: 'Jane', lastName: 'Doe' };
    const saved = { id: 1, ...dto };
    repo.create.mockReturnValue(dto);
    repo.save.mockResolvedValue(saved);
    const result = await service.create(dto);
    expect(result).toEqual(saved);
  });

  it('returns the standard paginated shape', async () => {
    const employee = { id: 1, firstName: 'Jane', lastName: 'Doe' };
    repo.findAndCount.mockResolvedValue([[employee], 1]);
    const result = await service.findAll({ page: 1, limit: 20 });
    expect(result).toEqual({ items: [employee], total: 1, page: 1, limit: 20 });
  });

  it('throws NotFoundException when the employee is missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates an employee and returns it', async () => {
    const existing = { id: 1, firstName: 'Jane', lastName: 'Doe' };
    repo.findOne.mockResolvedValue(existing);
    repo.save.mockResolvedValue({ ...existing, firstName: 'Janet' });
    const result = await service.update(1, { firstName: 'Janet' });
    expect(result.firstName).toBe('Janet');
  });

  it('removes an employee and returns its id', async () => {
    const existing = { id: 1, firstName: 'Jane', lastName: 'Doe' };
    repo.findOne.mockResolvedValue(existing);
    repo.remove.mockResolvedValue(existing);
    const result = await service.remove(1);
    expect(result).toEqual({ id: 1 });
  });
});
