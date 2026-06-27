import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './role.entity';
import { Permission } from './permission.entity';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AddRolePermissionDto } from './dto/add-role-permission.dto';
import { PaginationDto } from '../config/pagination.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role) private readonly repo: Repository<Role>,
    @InjectRepository(Permission) private readonly permRepo: Repository<Permission>,
  ) {}

  async create(dto: CreateRoleDto): Promise<Role> {
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Role already exists');
    return this.repo.save(this.repo.create(dto));
  }

  async findAll(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const [items, total] = await this.repo.findAndCount({ skip: (page - 1) * limit, take: limit, relations: { permissions: true } });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Role> {
    const found = await this.repo.findOne({ where: { id }, relations: { permissions: true } });
    if (!found) throw new NotFoundException('Role not found');
    return found;
  }

  async update(id: number, dto: UpdateRoleDto): Promise<Role> {
    const found = await this.findOne(id);
    Object.assign(found, dto);
    return this.repo.save(found);
  }

  async remove(id: number): Promise<void> {
    const found = await this.findOne(id);
    await this.repo.delete(found.id);
  }

  async addPermission(id: number, dto: AddRolePermissionDto): Promise<Role> {
    const role = await this.findOne(id);
    const permission = await this.permRepo.findOne({ where: { id: dto.permissionId } });
    if (!permission) throw new NotFoundException('Permission not found');
    if (!role.permissions.some((p) => p.id === permission.id)) {
      role.permissions.push(permission);
    }
    return this.repo.save(role);
  }

  async removePermission(id: number, permId: number): Promise<Role> {
    const role = await this.findOne(id);
    role.permissions = role.permissions.filter((p) => p.id !== permId);
    return this.repo.save(role);
  }
}
