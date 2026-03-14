import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm';

import { NotificationChannel, SubscriptionStatus } from '../../../types/notification';

@Entity({ name: 'subscriptions' })
export class SubscriptionEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 255 })
  eventType!: string;

  @Column({ type: 'varchar', length: 32 })
  channel!: NotificationChannel;

  @Column({ type: 'varchar', length: 512 })
  target!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: SubscriptionStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
