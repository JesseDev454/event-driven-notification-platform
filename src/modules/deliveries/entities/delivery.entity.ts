import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn
} from 'typeorm';

import { EventEntity } from '../../events/entities/event.entity';
import { SubscriptionEntity } from '../../subscriptions/entities/subscription.entity';
import { DeliveryStatus, NotificationChannel } from '../../../types/notification';

@Entity({ name: 'deliveries' })
@Unique('uq_deliveries_event_subscription', ['eventId', 'subscriptionId'])
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

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ name: 'max_retry_limit', type: 'int', default: 3 })
  maxRetryLimit!: number;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt!: Date | null;

  @Column({ name: 'last_error_summary', type: 'varchar', length: 1024, nullable: true })
  lastErrorSummary!: string | null;

  @Column({ name: 'failure_category', type: 'varchar', length: 128, nullable: true })
  failureCategory!: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

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
