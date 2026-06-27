import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Application } from '../applications/application.entity';
import { Candidate } from '../candidates/candidate.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { Employee } from '../employees/employee.entity';
import { ColumnNumericTransformer } from '../config/numeric.transformer';
import { PlacementStatus } from '../config/enums';

@Entity('placements')
export class Placement {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  applicationId: number;

  @ManyToOne(() => Application)
  @JoinColumn({ name: 'application_id' })
  application: Application;

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

  @Column()
  placedByEmployeeId: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'placed_by_employee_id' })
  placedBy: Employee;

  @Column({ type: 'date' })
  placementDate: string;

  @Column({ type: 'date', nullable: true })
  startDate?: string;

  @Column({ type: 'date', nullable: true })
  endDate?: string;

  @Column({ type: 'text', nullable: true })
  endReason?: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  agreedSalary?: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  fee?: number;

  @Column({
    type: 'enum',
    enum: PlacementStatus,
    enumName: 'placement_status',
    default: PlacementStatus.ACTIVE,
  })
  status: PlacementStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
