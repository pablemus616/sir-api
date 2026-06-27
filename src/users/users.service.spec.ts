import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Role } from '../roles/role.entity';

describe('UsersService', () => {
  let service: UsersService;
  const userRepo = { findOne: jest.fn(), create: jest.fn((v) => v), save: jest.fn((v) => Promise.resolve({ id: 1, ...v })) };
  const roleRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Role), useValue: roleRepo },
      ],
    }).compile();
    service = mod.get(UsersService);
  });

  it('hashes the password on create', async () => {
    userRepo.findOne.mockResolvedValue(null);
    await service.create({ username: 'a', password: 'pw', employeeId: 9 });
    const saved = userRepo.save.mock.calls[0][0];
    expect(saved.password).not.toBe('pw');
    await expect(bcrypt.compare('pw', saved.password)).resolves.toBe(true);
  });

  it('rejects a duplicate username', async () => {
    userRepo.findOne.mockResolvedValue({ id: 1, username: 'a' });
    await expect(service.create({ username: 'a', password: 'pw', employeeId: 9 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('adds a role without duplicating it', async () => {
    userRepo.findOne.mockResolvedValue({ id: 1, roles: [{ id: 2 }] });
    roleRepo.findOne.mockResolvedValue({ id: 3 });
    const out = await service.addRole(1, { roleId: 3 });
    expect(out.roles.map((r: Role) => r.id)).toEqual([2, 3]);
  });

  it('throws when the role does not exist', async () => {
    userRepo.findOne.mockResolvedValue({ id: 1, roles: [] });
    roleRepo.findOne.mockResolvedValue(null);
    await expect(service.addRole(1, { roleId: 9 })).rejects.toBeInstanceOf(NotFoundException);
  });
});
