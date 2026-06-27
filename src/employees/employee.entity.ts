import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('employees')
export class Employee {
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

  @Column({ type: 'date', nullable: true })
  hireDate?: string;

  @Column({ type: 'double precision', nullable: true })
  salary?: number;
}
