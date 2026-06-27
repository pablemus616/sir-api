import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sector } from './sector.entity';
import { CreateSectorDto } from './dto/create-sector.dto';
import { UpdateSectorDto } from './dto/update-sector.dto';
import { PaginationDto } from '../config/pagination.dto';

@Injectable()
export class SectorsService {
  constructor(
    @InjectRepository(Sector)
    private readonly repo: Repository<Sector>,
  ) {}

  async create(dto: CreateSectorDto): Promise<Sector> {
    const existing = await this.repo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException('Sector already exists');
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

  async findOne(id: number): Promise<Sector> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Sector not found');
    return entity;
  }

  async update(id: number, dto: UpdateSectorDto): Promise<Sector> {
    const entity = await this.findOne(id);
    if (dto.name && dto.name !== entity.name) {
      const clash = await this.repo.findOne({ where: { name: dto.name } });
      if (clash) throw new ConflictException('Sector already exists');
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
