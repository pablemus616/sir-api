import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from '../clients/client.entity';

@Entity('client_contacts')
export class ClientContact {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  phoneNumber?: string;

  @Column({ type: 'text', nullable: true })
  email?: string;

  @Column()
  clientId: number;

  @ManyToOne(() => Client, (client) => client.contacts)
  @JoinColumn({ name: 'client_id' })
  client: Client;
}
