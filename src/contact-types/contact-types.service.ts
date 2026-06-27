import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactType } from './contact-type.entity';
import { CreateContactTypeDto } from './dto/create-contact-type.dto';
import { UpdateContactTypeDto } from './dto/update-contact-type.dto';
import { PaginationDto } from '../config/pagination.dto';

@Injectable()
export class ContactTypesService {
  constructor(
    @InjectRepository(ContactType)
    private readonly repo: Repository<ContactType>,
  ) {}

  async create(dto: CreateContactTypeDto): Promise<ContactType> {
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

  async findOne(id: number): Promise<ContactType> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Contact type not found');
    return entity;
  }

  async update(id: number, dto: UpdateContactTypeDto): Promise<ContactType> {
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
