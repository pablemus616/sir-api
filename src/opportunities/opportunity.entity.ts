import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../clients/client.entity';
import { PositionArea } from '../position-areas/position-area.entity';
import { Employee } from '../employees/employee.entity';
import { ClientContact } from '../client-contacts/client-contact.entity';
import { PipelineStage } from '../pipeline-stages/pipeline-stage.entity';
import { ContactRequest } from '../contact-requests/contact-request.entity';
import { ColumnNumericTransformer } from '../config/numeric.transformer';
import { Seniority, OpportunityStatus } from '../config/enums';

@Entity('opportunities')
export class Opportunity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  clientId: number;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ nullable: true })
  areaId?: number;

  @ManyToOne(() => PositionArea, { nullable: true })
  @JoinColumn({ name: 'area_id' })
  area?: PositionArea;

  @Column()
  responsibleEmployeeId: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'responsible_employee_id' })
  responsibleEmployee: Employee;

  @Column({ nullable: true })
  clientContactId?: number;

  @ManyToOne(() => ClientContact, { nullable: true })
  @JoinColumn({ name: 'client_contact_id' })
  clientContact?: ClientContact;

  @Column()
  pipelineStageId: number;

  @ManyToOne(() => PipelineStage)
  @JoinColumn({ name: 'pipeline_stage_id' })
  pipelineStage: PipelineStage;

  @Column({ nullable: true })
  originContactRequestId?: number;

  @ManyToOne(() => ContactRequest, { nullable: true })
  @JoinColumn({ name: 'origin_contact_request_id' })
  originContactRequest?: ContactRequest;

  @Column({ type: 'text', nullable: true })
  title?: string;

  @Column({
    type: 'enum',
    enum: Seniority,
    enumName: 'seniority',
    nullable: true,
  })
  seniority?: Seniority;

  @Column({ type: 'int', default: 1 })
  headcount: number;

  @Column({ type: 'smallint', default: 0 })
  probability: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  amount?: number;

  @Column({ type: 'text', default: 'GTQ' })
  currency: string;

  @Column({
    type: 'enum',
    enum: OpportunityStatus,
    enumName: 'opportunity_status',
    default: OpportunityStatus.OPEN,
  })
  status: OpportunityStatus;

  @Column({ type: 'text', nullable: true })
  source?: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastContactAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  nextFollowUpAt?: Date;

  @Column({ type: 'date', nullable: true })
  expectedCloseDate?: string;

  @Column({ type: 'timestamptz', nullable: true })
  proposalSentAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  wonAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lostAt?: Date;

  @Column({ type: 'text', nullable: true })
  lostReason?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
