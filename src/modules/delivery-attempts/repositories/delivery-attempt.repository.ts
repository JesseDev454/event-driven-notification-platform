import { Repository } from 'typeorm';

import { DeliveryAttemptOutcome, NotificationChannel } from '../../../types/notification';
import { DeliveryAttemptEntity } from '../entities/delivery-attempt.entity';

export interface CreateDeliveryAttemptInput {
  id: string;
  deliveryId: string;
  attemptSequence: number;
  channel: NotificationChannel;
  providerName: string;
  outcome: DeliveryAttemptOutcome;
  failureCategory?: string | null;
  errorMessage?: string | null;
  providerResponseSummary?: string | null;
  attemptedAt: Date;
}

export class DeliveryAttemptRepository {
  constructor(private readonly repository: Repository<DeliveryAttemptEntity>) {}

  async create(input: CreateDeliveryAttemptInput): Promise<DeliveryAttemptEntity> {
    const attempt = this.repository.create({
      id: input.id,
      deliveryId: input.deliveryId,
      attemptSequence: input.attemptSequence,
      channel: input.channel,
      providerName: input.providerName,
      outcome: input.outcome,
      failureCategory: input.failureCategory ?? null,
      errorMessage: input.errorMessage ?? null,
      providerResponseSummary: input.providerResponseSummary ?? null,
      attemptedAt: input.attemptedAt
    });

    return this.repository.save(attempt);
  }

  async findByDeliveryId(deliveryId: string): Promise<DeliveryAttemptEntity[]> {
    return this.repository.find({
      where: { deliveryId },
      order: { attemptSequence: 'ASC' }
    });
  }
}
