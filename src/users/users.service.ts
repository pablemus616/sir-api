import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { Role } from '../roles/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AddUserRoleDto } from './dto/add-user-role.dto';
import { PaginationDto, getSkipTake } from '../config/pagination.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const exists = await this.repo.findOne({ where: { username: dto.username } });
    if (exists) throw new ConflictException('Username already exists');
    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.repo.save(this.repo.create({ ...dto, password }));
    return this.findOne(user.id);
  }

  async findAll(pagination: PaginationDto) {
    const { skip, take } = getSkipTake(pagination);
    const [items, total] = await this.repo.findAndCount({
      skip,
      take,
      relations: { roles: true },
      select: { id: true, username: true, employeeId: true },
    });
    return { items, total, page: pagination.page, limit: pagination.limit };
  }

  async findOne(id: number): Promise<User> {
    const found = await this.repo.findOne({
      where: { id },
      relations: { roles: true },
      select: { id: true, username: true, employeeId: true },
    });
    if (!found) throw new NotFoundException('User not found');
    return found;
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('User not found');
    const patch: Partial<User> = { ...dto };
    if (dto.password) patch.password = await bcrypt.hash(dto.password, 10);
    Object.assign(found, patch);
    await this.repo.save(found);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException('User not found');
    await this.repo.delete(found.id);
  }

  async addRole(id: number, dto: AddUserRoleDto): Promise<User> {
    const user = await this.repo.findOne({ where: { id }, relations: { roles: true } });
    if (!user) throw new NotFoundException('User not found');
    const role = await this.roleRepo.findOne({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (!user.roles.some((r) => r.id === role.id)) user.roles.push(role);
    await this.repo.save(user);
    return this.findOne(id);
  }

  async removeRole(id: number, roleId: number): Promise<User> {
    const user = await this.repo.findOne({ where: { id }, relations: { roles: true } });
    if (!user) throw new NotFoundException('User not found');
    user.roles = user.roles.filter((r) => r.id !== roleId);
    await this.repo.save(user);
    return this.findOne(id);
  }
}
