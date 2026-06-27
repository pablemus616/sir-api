import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Placement } from './placement.entity';
import { Application } from '../applications/application.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { PlacementsService } from './placements.service';
import { PlacementsController } from './placements.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Placement, Application, Opportunity])],
  controllers: [PlacementsController],
  providers: [PlacementsService],
  exports: [PlacementsService],
})
export class PlacementsModule {}
