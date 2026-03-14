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

import { DeliveryAttemptOutcome, NotificationChannel } from '../../../types/notification';
import { DeliveryEntity } from '../../deliveries/entities/delivery.entity';

@Entity({ name: 'delivery_attempts' })
export class DeliveryAttemptEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'delivery_id', type: 'uuid' })
  deliveryId!: string;

  @Column({ name: 'attempt_sequence', type: 'int' })
  attemptSequence!: number;

  @Column({ type: 'varchar', length: 32 })
  channel!: NotificationChannel;

  @Column({ name: 'provider_name', type: 'varchar', length: 128 })
  providerName!: string;

  @Column({ type: 'varchar', length: 32 })
  outcome!: DeliveryAttemptOutcome;

  @Column({ name: 'failure_category', type: 'varchar', length: 128, nullable: true })
  failureCategory!: string | null;

  @Column({ name: 'error_message', type: 'varchar', length: 1024, nullable: true })
  errorMessage!: string | null;

  @Column({
    name: 'provider_response_summary',
    type: 'varchar',
    length: 1024,
    nullable: true
  })
  providerResponseSummary!: string | null;

  @Column({ name: 'attempted_at', type: 'timestamptz' })
  attemptedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => DeliveryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'delivery_id' })
  delivery!: DeliveryEntity;
}
