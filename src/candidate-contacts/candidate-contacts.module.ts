// src/candidate-contacts/candidate-contacts.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidateContact } from './candidate-contact.entity';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { CandidateContactsService } from './candidate-contacts.service';
import { CandidateContactsController } from './candidate-contacts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CandidateContact, Candidate, Opportunity])],
  controllers: [CandidateContactsController],
  providers: [CandidateContactsService],
})
export class CandidateContactsModule {}
