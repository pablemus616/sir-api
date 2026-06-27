import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RolesService } from './roles.service';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

describe('RolesService assignments', () => {
  let service: RolesService;
  const roleRepo = { findOne: jest.fn(), save: jest.fn((v) => Promise.resolve(v)) };
  const permRepo = { findOne: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: getRepositoryToken(Role), useValue: roleRepo },
        { provide: getRepositoryToken(Permission), useValue: permRepo },
      ],
    }).compile();
    service = mod.get(RolesService);
  });

  it('adds a permission without duplicating it', async () => {
    roleRepo.findOne.mockResolvedValue({ id: 1, name: 'admin', permissions: [{ id: 5 }] });
    permRepo.findOne.mockResolvedValue({ id: 7 });
    const out = await service.addPermission(1, { permissionId: 7 });
    expect(out.permissions.map((p: Permission) => p.id)).toEqual([5, 7]);
  });

  it('throws when the permission does not exist', async () => {
    roleRepo.findOne.mockResolvedValue({ id: 1, name: 'admin', permissions: [] });
    permRepo.findOne.mockResolvedValue(null);
    await expect(service.addPermission(1, { permissionId: 9 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes a permission from the role', async () => {
    roleRepo.findOne.mockResolvedValue({ id: 1, name: 'admin', permissions: [{ id: 5 }, { id: 7 }] });
    permRepo.findOne.mockResolvedValue({ id: 5 });
    const out = await service.removePermission(1, 5);
    expect(out.permissions.map((p: Permission) => p.id)).toEqual([7]);
  });

  it('throws NotFoundException when the permission to remove does not exist', async () => {
    roleRepo.findOne.mockResolvedValue({ id: 1, name: 'admin', permissions: [{ id: 5 }] });
    permRepo.findOne.mockResolvedValue(null);
    await expect(service.removePermission(1, 99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
