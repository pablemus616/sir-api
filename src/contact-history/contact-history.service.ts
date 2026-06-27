import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactHistory } from './contact-history.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { CreateContactHistoryDto } from './dto/create-contact-history.dto';
import { QueryContactHistoryDto } from './dto/query-contact-history.dto';

@Injectable()
export class ContactHistoryService {
  constructor(
    @InjectRepository(ContactHistory)
    private readonly historyRepo: Repository<ContactHistory>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepo: Repository<Opportunity>,
  ) {}

  async create(dto: CreateContactHistoryDto, employeeId: number): Promise<ContactHistory> {
    const contactTime = new Date(dto.contactTime);
    const entity = this.historyRepo.create({
      employeeId,
      contactId: dto.contactId,
      contactType: { id: dto.contactType } as ContactType,
      contactTime,
      callLength: dto.callLength,
      contactDesc: dto.contactDesc,
      phoneNumberDialed: dto.phoneNumberDialed,
      direction: dto.direction,
      opportunityId: dto.opportunityId,
    });
    const saved = await this.historyRepo.save(entity);
    if (dto.opportunityId) {
      await this.touchOpportunity(dto.opportunityId, contactTime);
    }
    return this.findOne(saved.id);
  }

  private async touchOpportunity(opportunityId: number, contactTime: Date): Promise<void> {
    const opportunity = await this.opportunityRepo.findOne({ where: { id: opportunityId } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    if (!opportunity.lastContactAt || contactTime > opportunity.lastContactAt) {
      opportunity.lastContactAt = contactTime;
      await this.opportunityRepo.save(opportunity);
    }
  }

  async findAll(
    query: QueryContactHistoryDto,
  ): Promise<{ items: ContactHistory[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.historyRepo
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.employee', 'employee')
      .leftJoinAndSelect('history.contact', 'contact')
      .leftJoinAndSelect('history.contactType', 'contactType');
    if (query.employeeId) {
      qb.andWhere('history.employeeId = :employeeId', { employeeId: query.employeeId });
    }
    if (query.contactId) {
      qb.andWhere('history.contactId = :contactId', { contactId: query.contactId });
    }
    if (query.clientId) {
      qb.andWhere('contact.clientId = :clientId', { clientId: query.clientId });
    }
    if (query.contactType) {
      qb.andWhere('contactType.id = :contactType', { contactType: query.contactType });
    }
    if (query.opportunityId) {
      qb.andWhere('history.opportunityId = :opportunityId', { opportunityId: query.opportunityId });
    }
    if (query.direction) {
      qb.andWhere('history.direction = :direction', { direction: query.direction });
    }
    if (query.from) {
      qb.andWhere('history.contactTime >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('history.contactTime <= :to', { to: query.to });
    }
    qb.orderBy('history.contactTime', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<ContactHistory> {
    const history = await this.historyRepo.findOne({
      where: { id },
      relations: { employee: true, contact: true, contactType: true, opportunity: true },
    });
    if (!history) {
      throw new NotFoundException('Contact history not found');
    }
    return history;
  }
}
