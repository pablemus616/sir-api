import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../config/numeric.transformer';
import { Application } from '../applications/application.entity';

export const CANDIDATE_STATUSES = [
  'new',
  'active',
  'placed',
  'on_hold',
  'discarded',
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

@Entity('candidates')
export class Candidate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column({ nullable: true })
  secondName?: string;

  @Column()
  lastName: string;

  @Column({ nullable: true })
  surName?: string;

  @Column({ nullable: true })
  nationalId?: string;

  @Column({ nullable: true })
  phoneNumber?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ type: 'date', nullable: true })
  birthDate?: string;

  @Column({ nullable: true })
  headline?: string;

  @Column({ nullable: true })
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
    enum: [...CANDIDATE_STATUSES],
    enumName: 'candidate_status',
    default: 'new',
  })
  status: CandidateStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => Application, (application) => application.candidate)
  applications: Application[];
}
