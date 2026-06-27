import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Employee } from '../employees/employee.entity';
import { ClientContact } from '../client-contacts/client-contact.entity';
import { ContactType } from '../contact-types/contact-type.entity';
import { Opportunity } from '../opportunities/opportunity.entity';
import { ContactDirection } from '../config/enums';

@Entity('contact_history')
export class ContactHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  employeeId: number;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employee_id' })
  employee: Employee;

  @Column()
  contactId: number;

  @ManyToOne(() => ClientContact)
  @JoinColumn({ name: 'contact_id' })
  contact: ClientContact;

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

  @Column({ nullable: true })
  opportunityId?: number;

  @ManyToOne(() => Opportunity, { nullable: true })
  @JoinColumn({ name: 'opportunity_id' })
  opportunity?: Opportunity;
}
