// src/candidate-contacts/candidate-contacts.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CandidateContact } from './candidate-contact.entity';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { CreateCandidateContactDto } from './dto/create-candidate-contact.dto';
import { QueryCandidateContactsDto } from './dto/query-candidate-contacts.dto';

@Injectable()
export class CandidateContactsService {
  constructor(
    @InjectRepository(CandidateContact)
    private readonly repo: Repository<CandidateContact>,
    @InjectRepository(Candidate)
    private readonly candidateRepo: Repository<Candidate>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepo: Repository<Opportunity>,
    @InjectRepository(ContactType)
    private readonly contactTypeRepo: Repository<ContactType>,
  ) {}

  async create(
    dto: CreateCandidateContactDto,
    recruiterEmployeeId: number,
  ): Promise<CandidateContact> {
    const candidate = await this.candidateRepo.findOne({ where: { id: dto.candidateId } });
    if (!candidate) {
      throw new NotFoundException('Candidate not found');
    }
    const opportunity = await this.opportunityRepo.findOne({ where: { id: dto.opportunityId } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    const contactType = await this.contactTypeRepo.findOne({ where: { id: dto.contactType } });
    if (!contactType) {
      throw new NotFoundException('Contact type not found');
    }
    const contactTime = new Date(dto.contactTime);
    if (!opportunity.lastContactAt || contactTime > opportunity.lastContactAt) {
      opportunity.lastContactAt = contactTime;
      await this.opportunityRepo.save(opportunity);
    }
    const entity = this.repo.create({
      candidateId: dto.candidateId,
      opportunityId: dto.opportunityId,
      contactType: { id: dto.contactType } as ContactType,
      contactTime,
      callLength: dto.callLength,
      contactDesc: dto.contactDesc,
      phoneNumberDialed: dto.phoneNumberDialed,
      direction: dto.direction,
      recruiterEmployeeId,
    });
    const saved = await this.repo.save(entity);
    return this.findOne(saved.id);
  }

  async findAll(
    query: QueryCandidateContactsDto,
  ): Promise<{ items: CandidateContact[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.repo
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.candidate', 'candidate')
      .leftJoinAndSelect('cc.opportunity', 'opportunity')
      .leftJoinAndSelect('cc.contactType', 'contactType')
      .leftJoinAndSelect('cc.recruiter', 'recruiter');
    if (query.candidateId) {
      qb.andWhere('cc.candidateId = :candidateId', { candidateId: query.candidateId });
    }
    if (query.opportunityId) {
      qb.andWhere('cc.opportunityId = :opportunityId', { opportunityId: query.opportunityId });
    }
    if (query.recruiterId) {
      qb.andWhere('cc.recruiterEmployeeId = :recruiterId', { recruiterId: query.recruiterId });
    }
    if (query.from) {
      qb.andWhere('cc.contactTime >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('cc.contactTime <= :to', { to: query.to });
    }
    qb.orderBy('cc.contactTime', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<CandidateContact> {
    const found = await this.repo.findOne({
      where: { id },
      relations: { candidate: true, opportunity: true, contactType: true, recruiter: true },
    });
    if (!found) {
      throw new NotFoundException('Candidate contact not found');
    }
    return found;
  }
}
