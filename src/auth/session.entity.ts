import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('sessions')
export class Session {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id: string;

  @Column()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text', unique: true })
  token: string;

  @CreateDateColumn({ type: 'timestamptz' })
  creationDate: Date;

  @Column({ type: 'timestamptz', nullable: true })
  refreshedAt?: Date;

  @Column({ type: 'text', nullable: true })
  ip?: string;
}
