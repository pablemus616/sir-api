import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('position_areas')
export class PositionArea {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', unique: true })
  name: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
