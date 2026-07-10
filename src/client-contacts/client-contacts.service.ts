import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ClientContact } from './client-contact.entity';
import { CreateClientContactDto } from './dto/create-client-contact.dto';
import { UpdateClientContactDto } from './dto/update-client-contact.dto';
import { QueryClientContactDto } from './dto/query-client-contact.dto';

@Injectable()
export class ClientContactsService {
  constructor(
    @InjectRepository(ClientContact)
    private readonly repo: Repository<ClientContact>,
  ) {}

  async create(dto: CreateClientContactDto): Promise<ClientContact> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(query: QueryClientContactDto) {
    const { page = 1, limit = 20, clientId } = query;
    const where: FindOptionsWhere<ClientContact> = {};
    if (clientId !== undefined) where.clientId = clientId;
    const [items, total] = await this.repo.findAndCount({
      where,
      relations: { client: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { id: 'DESC' },
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<ClientContact> {
    const entity = await this.repo.findOne({ where: { id }, relations: { client: true } });
    if (!entity) throw new NotFoundException('Client contact not found');
    return entity;
  }

  async update(
    id: number,
    dto: UpdateClientContactDto,
  ): Promise<ClientContact> {
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
