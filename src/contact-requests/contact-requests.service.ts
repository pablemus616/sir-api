import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactRequest } from './contact-request.entity';
import { CreateContactRequestDto } from './dto/create-contact-request.dto';
import { QueryContactRequestDto } from './dto/query-contact-request.dto';
import { HandleContactRequestDto } from './dto/handle-contact-request.dto';

@Injectable()
export class ContactRequestsService {
  constructor(
    @InjectRepository(ContactRequest)
    private readonly requestRepo: Repository<ContactRequest>,
  ) {}

  async create(dto: CreateContactRequestDto): Promise<ContactRequest> {
    const entity = this.requestRepo.create(dto);
    return this.requestRepo.save(entity);
  }

  async findAll(
    query: QueryContactRequestDto,
  ): Promise<{ items: ContactRequest[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await this.requestRepo.findAndCount({
      where: query.wasHandled === undefined ? {} : { wasHandled: query.wasHandled },
      relations: { handledBy: true, resultingClient: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<ContactRequest> {
    const request = await this.requestRepo.findOne({
      where: { id },
      relations: { handledBy: true, resultingClient: true },
    });
    if (!request) {
      throw new NotFoundException('Contact request not found');
    }
    return request;
  }

  async handle(id: number, dto: HandleContactRequestDto, employeeId: number): Promise<ContactRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException('Contact request not found');
    }
    if (request.wasHandled) {
      throw new ConflictException('Contact request already handled');
    }
    request.wasHandled = true;
    request.handledAt = new Date();
    request.handledByEmployeeId = employeeId;
    if (dto.resultingClientId !== undefined) {
      request.resultingClientId = dto.resultingClientId;
    }
    return this.requestRepo.save(request);
  }
}
