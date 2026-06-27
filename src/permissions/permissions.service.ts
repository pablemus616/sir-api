import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permission } from '../roles/permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PaginationDto } from '../config/pagination.dto';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission) private readonly repo: Repository<Permission>,
  ) {}

  async create(dto: CreatePermissionDto): Promise<Permission> {
    const exists = await this.repo.findOne({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Permission already exists');
    return this.repo.save(this.repo.create(dto));
  }

  async findAll(pagination: PaginationDto) {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const [items, total] = await this.repo.findAndCount({ skip: (page - 1) * limit, take: limit });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Permission> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('Permission not found');
    return found;
  }

  async update(id: number, dto: UpdatePermissionDto): Promise<Permission> {
    const found = await this.findOne(id);
    Object.assign(found, dto);
    return this.repo.save(found);
  }

  async remove(id: number): Promise<void> {
    const found = await this.findOne(id);
    await this.repo.delete(found.id);
  }
}
