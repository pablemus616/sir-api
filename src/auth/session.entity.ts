import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('sessions')
export class Session {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', unique: true })
  token: string;

  @Column({ type: 'timestamptz' })
  creationDate: Date;

  @Column({ type: 'timestamptz', nullable: true })
  refreshedAt?: Date;

  @Column({ type: 'text', nullable: true })
  ip?: string;
}
