import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Opportunity } from './opportunity.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { QueryOpportunityDto } from './dto/query-opportunity.dto';
import { ChangeStageDto } from './dto/change-stage.dto';
import { LoseOpportunityDto } from './dto/lose-opportunity.dto';
import { SendProposalDto } from './dto/send-proposal.dto';
import { FollowUpDto } from './dto/follow-up.dto';
import { OpportunityStatus } from '../config/enums';

@Injectable()
export class OpportunitiesService {
  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(PipelineStage)
    private readonly pipelineStageRepository: Repository<PipelineStage>,
  ) {}

  async create(dto: CreateOpportunityDto): Promise<Opportunity> {
    const stage = await this.pipelineStageRepository.findOne({ where: { id: dto.pipelineStageId } });
    if (!stage) throw new NotFoundException('Pipeline stage not found');
    const opportunity = this.opportunityRepository.create(dto);
    // Crear directo en 'Ganada'/'Cerrada'/'Perdida' la cierra: antes quedaba 'open'
    // en esa columna y no sumaba en "Quetzales ganados".
    this.moveToStage(opportunity, stage);
    const saved = await this.opportunityRepository.save(opportunity);
    return this.findOne(saved.id);
  }

  async findAll(query: QueryOpportunityDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.opportunityRepository
      .createQueryBuilder('opportunity')
      .leftJoinAndSelect('opportunity.client', 'client')
      .leftJoinAndSelect('opportunity.area', 'area')
      .leftJoinAndSelect('opportunity.pipelineStage', 'pipelineStage')
      .leftJoinAndSelect('opportunity.responsibleEmployee', 'responsibleEmployee');

    if (query.sectorId !== undefined) {
      // 'client' ya está unido arriba; solo filtramos por su sectorId.
      qb.andWhere('client.sectorId = :sectorId', { sectorId: query.sectorId });
    }
    if (query.clientId !== undefined) {
      qb.andWhere('opportunity.clientId = :clientId', { clientId: query.clientId });
    }
    if (query.areaId !== undefined) {
      qb.andWhere('opportunity.areaId = :areaId', { areaId: query.areaId });
    }
    if (query.stageId !== undefined) {
      qb.andWhere('opportunity.pipelineStageId = :stageId', { stageId: query.stageId });
    }
    if (query.status !== undefined) {
      qb.andWhere('opportunity.status = :status', { status: query.status });
    }
    if (query.responsibleEmployeeId !== undefined) {
      qb.andWhere('opportunity.responsibleEmployeeId = :responsibleEmployeeId', {
        responsibleEmployeeId: query.responsibleEmployeeId,
      });
    }
    if (query.followUpDue) {
      qb.andWhere('opportunity.nextFollowUpAt <= :now', { now: new Date() });
    }

    qb.orderBy('opportunity.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<Opportunity> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
      relations: { client: true, area: true, responsibleEmployee: true, clientContact: true, pipelineStage: true },
    });
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    return opportunity;
  }

  async update(id: number, dto: UpdateOpportunityDto): Promise<Opportunity> {
    const current = await this.findOne(id); // 404 si no existe
    const { pipelineStageId, ...fields } = dto;
    // update() escribe columnas directamente: evita que las relaciones cargadas
    // (client/area/pipelineStage…) reviertan los FK escalares al hacer save().
    if (Object.keys(fields).length > 0) {
      await this.opportunityRepository.update(id, fields);
    }
    // Cambiar la etapa desde el formulario pasa por changeStage para que el status
    // la siga (antes podía quedar 'won' en 'Perdida' u 'open' en 'Ganada').
    if (pipelineStageId !== undefined && pipelineStageId !== current.pipelineStageId) {
      return this.changeStage(id, { pipelineStageId });
    }
    return this.findOne(id);
  }

  async changeStage(id: number, dto: ChangeStageDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    const stage = await this.pipelineStageRepository.findOne({
      where: { id: dto.pipelineStageId },
    });
    if (!stage) {
      throw new NotFoundException('Pipeline stage not found');
    }
    if (!stage.active) {
      throw new BadRequestException('Pipeline stage is not active');
    }
    this.moveToStage(opportunity, stage, dto);
    await this.opportunityRepository.save(opportunity);
    return this.findOne(id);
  }

  async win(id: number): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    const stage = await this.closingStage(opportunity.pipelineStage, 'isWon');
    if (!stage) throw new BadRequestException('No active won stage configured');
    this.moveToStage(opportunity, stage);
    await this.opportunityRepository.save(opportunity);
    return this.findOne(id);
  }

  async lose(id: number, dto: LoseOpportunityDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    const stage = await this.closingStage(opportunity.pipelineStage, 'isLost');
    if (!stage) throw new BadRequestException('No active lost stage configured');
    this.moveToStage(opportunity, stage, { lostReason: dto.lostReason });
    await this.opportunityRepository.save(opportunity);
    return this.findOne(id);
  }

  /**
   * Única transición etapa → status. Crear, mover, ganar y perder pasan por aquí
   * para que la columna del kanban y el status (lo que suman las métricas, p. ej.
   * "Quetzales ganados") no se desincronicen.
   */
  private moveToStage(
    opportunity: Opportunity,
    stage: PipelineStage,
    opts: { probability?: number; lostReason?: string } = {},
  ): void {
    const previous = opportunity.status;
    // Setear la RELACIÓN además del FK escalar: findOne carga `pipelineStage`,
    // y al guardar TypeORM da prioridad a la relación cargada (stage anterior),
    // revirtiendo el cambio si solo se actualiza el escalar.
    opportunity.pipelineStageId = stage.id;
    opportunity.pipelineStage = stage;
    opportunity.probability = opts.probability ?? stage.probability;
    if (stage.isWon) {
      opportunity.status = OpportunityStatus.WON;
      // Conserva la fecha original si ya estaba ganada (p. ej. de 'Ganada' a 'Cerrada').
      if (previous !== OpportunityStatus.WON || !opportunity.wonAt) {
        opportunity.wonAt = new Date();
      }
      opportunity.lostAt = null;
      opportunity.lostReason = null;
    } else if (stage.isLost) {
      opportunity.status = OpportunityStatus.LOST;
      if (previous !== OpportunityStatus.LOST || !opportunity.lostAt) {
        opportunity.lostAt = new Date();
      }
      opportunity.wonAt = null;
      if (opts.lostReason !== undefined) {
        opportunity.lostReason = opts.lostReason;
      }
    } else {
      opportunity.status = OpportunityStatus.OPEN;
      opportunity.wonAt = null;
      opportunity.lostAt = null;
      opportunity.lostReason = null;
    }
  }

  /**
   * Etapa destino al ganar/perder: la actual si ya es de ese tipo (una ganada en
   * 'Cerrada' se queda en 'Cerrada'); si no, la primera activa por sortOrder, para
   * que sea determinista cuando hay varias (p. ej. 'Ganada' y 'Cerrada').
   */
  private async closingStage(
    current: PipelineStage | undefined,
    flag: 'isWon' | 'isLost',
  ): Promise<PipelineStage | null> {
    if (current?.[flag] && current.active) return current;
    const where: FindOptionsWhere<PipelineStage> = { [flag]: true, active: true };
    return this.pipelineStageRepository.findOne({ where, order: { sortOrder: 'ASC' } });
  }

  async sendProposal(id: number, dto: SendProposalDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    if (opportunity.proposalSentAt == null) {
      opportunity.proposalSentAt = new Date();
    }
    if (dto.amount !== undefined) {
      opportunity.amount = dto.amount;
    }
    await this.opportunityRepository.save(opportunity);
    return this.findOne(id);
  }

  async setFollowUp(id: number, dto: FollowUpDto): Promise<Opportunity> {
    const opportunity = await this.findOne(id);
    opportunity.nextFollowUpAt = dto.nextFollowUpAt;
    await this.opportunityRepository.save(opportunity);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    const opportunity = await this.findOne(id);
    await this.opportunityRepository.remove(opportunity);
  }
}
