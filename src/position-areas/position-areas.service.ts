import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PositionArea } from './position-area.entity';
import { CreatePositionAreaDto } from './dto/create-position-area.dto';
import { UpdatePositionAreaDto } from './dto/update-position-area.dto';
import { PaginationDto } from '../config/pagination.dto';

@Injectable()
export class PositionAreasService {
  constructor(
    @InjectRepository(PositionArea)
    private readonly repo: Repository<PositionArea>,
  ) {}

  async create(dto: CreatePositionAreaDto): Promise<PositionArea> {
    const existing = await this.repo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Position area already exists');
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

  async findOne(id: number): Promise<PositionArea> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Position area not found');
    return entity;
  }

  async update(id: number, dto: UpdatePositionAreaDto): Promise<PositionArea> {
    const entity = await this.findOne(id);
    if (dto.name && dto.name !== entity.name) {
      const clash = await this.repo.findOne({ where: { name: dto.name } });
      if (clash) throw new ConflictException('Position area already exists');
    }
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: number): Promise<{ id: number }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { id };
  }
}
