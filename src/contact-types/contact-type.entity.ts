import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('contact_types')
export class ContactType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;
}
