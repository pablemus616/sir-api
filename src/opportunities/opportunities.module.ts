import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from './opportunity.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Opportunity, PipelineStage])],
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
