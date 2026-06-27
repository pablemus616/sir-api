import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { PipelineStage } from './pipeline-stage.entity';
import { CreatePipelineStageDto } from './dto/create-pipeline-stage.dto';
import { UpdatePipelineStageDto } from './dto/update-pipeline-stage.dto';
import { QueryPipelineStageDto } from './dto/query-pipeline-stage.dto';

@Injectable()
export class PipelineStagesService {
  constructor(
    @InjectRepository(PipelineStage)
    private readonly repo: Repository<PipelineStage>,
  ) {}

  async create(dto: CreatePipelineStageDto): Promise<PipelineStage> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(query: QueryPipelineStageDto) {
    const { page = 1, limit = 20, active } = query;
    const where: FindOptionsWhere<PipelineStage> = {};
    if (active !== undefined) where.active = active;
    const [items, total] = await this.repo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { sortOrder: 'ASC' },
    });
    return { items, total, page, limit };
  }

  async findOne(id: number): Promise<PipelineStage> {
    const entity = await this.repo.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('Pipeline stage not found');
    return entity;
  }

  async update(
    id: number,
    dto: UpdatePipelineStageDto,
  ): Promise<PipelineStage> {
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
