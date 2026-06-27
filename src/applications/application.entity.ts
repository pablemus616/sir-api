import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { Employee } from '../employees/employee.entity';
import { ApplicationStage } from '../config/enums';

@Entity('applications')
@Unique(['candidateId', 'opportunityId'])
export class Application {
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

  @Column({ nullable: true })
  referredByEmployeeId?: number;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'referred_by_employee_id' })
  referredBy?: Employee;

  @Column({
    type: 'enum',
    enum: ApplicationStage,
    enumName: 'application_stage',
    default: ApplicationStage.APPLIED,
  })
  stage: ApplicationStage;

  @Column({ type: 'text', nullable: true })
  source?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  appliedAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
