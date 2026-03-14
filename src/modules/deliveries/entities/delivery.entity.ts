import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm';

import { EventEntity } from '../../events/entities/event.entity';
import { SubscriptionEntity } from '../../subscriptions/entities/subscription.entity';
import { DeliveryStatus, NotificationChannel } from '../../../types/notification';

@Entity({ name: 'deliveries' })
export class DeliveryEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Index()
  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Column({ type: 'varchar', length: 32 })
  channel!: NotificationChannel;

  @Column({ type: 'varchar', length: 512 })
  target!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: DeliveryStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => EventEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'event_id' })
  event!: EventEntity;

  @ManyToOne(() => SubscriptionEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subscription_id' })
  subscription!: SubscriptionEntity;
}
