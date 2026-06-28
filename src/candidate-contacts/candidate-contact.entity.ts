// src/candidate-contacts/candidate-contact.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { Employee } from '../employees/employee.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { ContactDirection } from '../config/enums';

@Entity('candidate_contacts')
export class CandidateContact {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  candidateId: number;

  @ManyToOne(() => Candidate)
  @JoinColumn({ name: 'candidate_id' })
  candidate: Candidate;

  @Column()
  opportunityId: number;

  @ManyToOne(() => Opportunity)
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity;

  @ManyToOne(() => ContactType)
  @JoinColumn({ name: 'contact_type' })
  contactType: ContactType;

  @Column({ type: 'timestamptz' })
  contactTime: Date;

  @Column({ type: 'int', nullable: true })
  callLength?: number;

  @Column({ type: 'text', nullable: true })
  contactDesc?: string;

  @Column({ type: 'text', nullable: true })
  phoneNumberDialed?: string;

  @Column({
    type: 'enum',
    enum: ContactDirection,
    enumName: 'contact_direction',
    nullable: true,
  })
  direction?: ContactDirection;

  @Column()
  recruiterEmployeeId: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'recruiter_employee_id' })
  recruiter: Employee;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
