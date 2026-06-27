import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { Client } from '../clients/client.entity';

@Entity('contact_requests')
export class ContactRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', nullable: true })
  contactName?: string;

  @Column({ type: 'text', nullable: true })
  phoneNumber?: string;

  @Column({ type: 'text', nullable: true })
  email?: string;

  @Column({ type: 'text', nullable: true })
  requestDesc?: string;

  @Column({ type: 'boolean', default: false })
  wasHandled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ nullable: true })
  handledByEmployeeId?: number;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'handled_by_employee_id' })
  handledBy?: Employee;

  @Column({ type: 'timestamptz', nullable: true })
  handledAt?: Date;

  @Column({ nullable: true })
  resultingClientId?: number;

  @ManyToOne(() => Client, { nullable: true })
  @JoinColumn({ name: 'resulting_client_id' })
  resultingClient?: Client;
}
