import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from './employee.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { PaginationDto } from '../config/pagination.dto';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly repo: Repository<Employee>,
  ) {}

  async create(dto: CreateEmployeeDto): Promise<Employee> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(query: PaginationDto) {
    const { page = 1, limit = 20 } = query;
    const [items, total] = await this.repo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Employee> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Employee not found');
    return entity;
  }

  async update(id: number, dto: UpdateEmployeeDto): Promise<Employee> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: number): Promise<{ id: number }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { id };
  }
}
