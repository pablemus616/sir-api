import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Client } from './client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientDto } from './dto/query-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly repo: Repository<Client>,
  ) {}

  async create(dto: CreateClientDto): Promise<Client> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(query: QueryClientDto) {
    const { page = 1, limit = 20, sectorId } = query;
    const where: FindOptionsWhere<Client> = {};
    if (sectorId !== undefined) where.sectorId = sectorId;
    const [items, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Client> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: { contacts: true },
    });
    if (!entity) throw new NotFoundException('Client not found');
    return entity;
  }

  async update(id: number, dto: UpdateClientDto): Promise<Client> {
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
