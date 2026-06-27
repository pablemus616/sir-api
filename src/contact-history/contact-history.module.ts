import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContactHistory } from './contact-history.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactHistoryService } from './contact-history.service';
import { ContactHistoryController } from './contact-history.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ContactHistory, Opportunity])],
  controllers: [ContactHistoryController],
  providers: [ContactHistoryService],
})
export class ContactHistoryModule {}
