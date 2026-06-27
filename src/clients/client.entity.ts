import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Sector } from '../sectors/sector.entity';
import { ClientContact } from '../client-contacts/client-contact.entity';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  sector?: string;

  @Column({ nullable: true })
  sectorId?: number;

  @ManyToOne(() => Sector, { nullable: true })
  @JoinColumn({ name: 'sector_id' })
  sectorCatalog?: Sector;

  @Column({ type: 'int', nullable: true })
  employeeSize?: number;

  @OneToMany(() => ClientContact, (contact) => contact.client)
  contacts: ClientContact[];
}
