import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Application, ApplicationStage } from './application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ChangeApplicationStageDto } from './dto/change-application-stage.dto';
import { FilterApplicationsDto } from './dto/filter-applications.dto';

const APPLICATION_TRANSITIONS: Record<ApplicationStage, ApplicationStage[]> = {
  [ApplicationStage.APPLIED]: [
    ApplicationStage.SCREENING,
    ApplicationStage.REJECTED,
    ApplicationStage.WITHDRAWN,
  ],
  [ApplicationStage.SCREENING]: [
    ApplicationStage.INTERVIEW,
    ApplicationStage.REJECTED,
    ApplicationStage.WITHDRAWN,
  ],
  [ApplicationStage.INTERVIEW]: [
    ApplicationStage.OFFER,
    ApplicationStage.REJECTED,
    ApplicationStage.WITHDRAWN,
  ],
  [ApplicationStage.OFFER]: [
    ApplicationStage.HIRED,
    ApplicationStage.REJECTED,
    ApplicationStage.WITHDRAWN,
  ],
  [ApplicationStage.HIRED]: [],
  [ApplicationStage.REJECTED]: [],
  [ApplicationStage.WITHDRAWN]: [],
};

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly applicationsRepository: Repository<Application>,
  ) {}

  async create(dto: CreateApplicationDto): Promise<Application> {
    const existing = await this.applicationsRepository.findOne({
      where: { candidateId: dto.candidateId, opportunityId: dto.opportunityId },
    });
    if (existing) {
      throw new ConflictException(
        `Application for candidate ${dto.candidateId} and opportunity ${dto.opportunityId} already exists`,
      );
    }
    const application = this.applicationsRepository.create(dto);
    return this.applicationsRepository.save(application);
  }

  async findAll(query: FilterApplicationsDto): Promise<Application[]> {
    const { opportunityId, candidateId, stage } = query;
    const qb = this.applicationsRepository
      .createQueryBuilder('application')
      .leftJoinAndSelect('application.candidate', 'candidate')
      .leftJoinAndSelect('application.opportunity', 'opportunity');
    if (opportunityId)
      qb.andWhere('application.opportunityId = :opportunityId', { opportunityId });
    if (candidateId)
      qb.andWhere('application.candidateId = :candidateId', { candidateId });
    if (stage) qb.andWhere('application.stage = :stage', { stage });
    qb.orderBy('application.appliedAt', 'DESC');
    return qb.getMany();
  }

  async findOne(id: number): Promise<Application> {
    const application = await this.applicationsRepository.findOne({
      where: { id },
      relations: { candidate: true, opportunity: true },
    });
    if (!application) throw new NotFoundException(`Application ${id} not found`);
    return application;
  }

  async changeStage(
    id: number,
    dto: ChangeApplicationStageDto,
  ): Promise<Application> {
    const application = await this.findOne(id);
    const allowed = APPLICATION_TRANSITIONS[application.stage];
    if (!allowed.includes(dto.stage)) {
      throw new BadRequestException(
        `Cannot transition application from ${application.stage} to ${dto.stage}`,
      );
    }
    application.stage = dto.stage;
    return this.applicationsRepository.save(application);
  }
}
