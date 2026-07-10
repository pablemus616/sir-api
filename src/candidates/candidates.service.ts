import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Candidate } from './candidate.entity';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { SearchCandidatesDto } from './dto/search-candidates.dto';
import { ApplicationStage } from '../config/enums';

@Injectable()
export class CandidatesService {
  constructor(
    @InjectRepository(Candidate)
    private readonly candidatesRepository: Repository<Candidate>,
  ) {}

  async create(dto: CreateCandidateDto): Promise<Candidate> {
    const candidate = this.candidatesRepository.create(dto);
    return this.candidatesRepository.save(candidate);
  }

  async findAll(query: SearchCandidatesDto): Promise<{
    items: Candidate[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, name, email, status, source, available } =
      query;
    const qb = this.candidatesRepository.createQueryBuilder('candidate');
    if (name) {
      qb.andWhere(
        '(candidate.firstName ILIKE :name OR candidate.secondName ILIKE :name OR candidate.lastName ILIKE :name OR candidate.surName ILIKE :name)',
        { name: `%${name}%` },
      );
    }
    if (email) qb.andWhere('candidate.email ILIKE :email', { email: `%${email}%` });
    if (status) qb.andWhere('candidate.status = :status', { status });
    if (source) qb.andWhere('candidate.source = :source', { source });
    if (available) {
      // Excluye candidatos con cualquier aplicación que no sea 'withdrawn':
      // proceso activo, contratado (placement) o rechazado.
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM applications app
          WHERE app.candidate_id = candidate.id
            AND app.stage::text <> :withdrawnStage
        )`,
        { withdrawnStage: ApplicationStage.WITHDRAWN },
      );
    }
    qb.orderBy('candidate.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Candidate> {
    const candidate = await this.candidatesRepository.findOne({
      where: { id },
      relations: { applications: true },
    });
    if (!candidate) throw new NotFoundException(`Candidate ${id} not found`);
    return candidate;
  }

  async update(id: number, dto: UpdateCandidateDto): Promise<Candidate> {
    const candidate = await this.findOne(id);
    Object.assign(candidate, dto);
    return this.candidatesRepository.save(candidate);
  }

  async remove(id: number): Promise<void> {
    const result = await this.candidatesRepository.delete(id);
    if (!result.affected) throw new NotFoundException(`Candidate ${id} not found`);
  }
}
