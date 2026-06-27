import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/employee.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { Sector } from '../sectors/sector.entity';
import { PositionArea } from '../position-areas/position-area.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Employee, ContactType, Sector, PositionArea, PipelineStage])],
  exports: [TypeOrmModule],
})
export class CatalogsModule {}
