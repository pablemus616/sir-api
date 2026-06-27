import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../config/numeric.transformer';
import { CandidateStatus } from '../config/enums';

@Entity('candidates')
export class Candidate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  firstName: string;

  @Column({ type: 'text', nullable: true })
  secondName?: string;

  @Column({ type: 'text' })
  lastName: string;

  @Column({ type: 'text', nullable: true })
  surName?: string;

  @Column({ type: 'text', nullable: true })
  nationalId?: string;

  @Column({ type: 'text', nullable: true })
  phoneNumber?: string;

  @Column({ type: 'text', nullable: true })
  email?: string;

  @Column({ type: 'date', nullable: true })
  birthDate?: string;

  @Column({ type: 'text', nullable: true })
  headline?: string;

  @Column({ type: 'text', nullable: true })
  source?: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  expectedSalary?: number;

  @Column({
    type: 'enum',
    enum: CandidateStatus,
    enumName: 'candidate_status',
    default: CandidateStatus.NEW,
  })
  status: CandidateStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
