import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PositionArea } from './position-area.entity';
import { PositionAreasService } from './position-areas.service';
import { PositionAreasController } from './position-areas.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PositionArea])],
  controllers: [PositionAreasController],
  providers: [PositionAreasService],
  exports: [PositionAreasService],
})
export class PositionAreasModule {}
