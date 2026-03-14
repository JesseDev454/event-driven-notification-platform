import { randomUUID } from 'node:crypto';

import { SubscriptionEntity } from '../../subscriptions/entities/subscription.entity';
import { DeliveryStatus } from '../../../types/notification';
import { DeliveryRepository } from '../repositories/delivery.repository';
import { DeliveryEntity } from '../entities/delivery.entity';

export class DeliveryService {
  constructor(private readonly deliveryRepository: DeliveryRepository) {}

  async createPendingDeliveries(
    eventId: string,
    subscriptions: SubscriptionEntity[]
  ): Promise<DeliveryEntity[]> {
    if (subscriptions.length === 0) {
      return [];
    }

    return this.deliveryRepository.createMany(
      subscriptions.map((subscription) => ({
        id: randomUUID(),
        eventId,
        subscriptionId: subscription.id,
        channel: subscription.channel,
        target: subscription.target
      }))
    );
  }

  async getDeliveriesForEvent(eventId: string): Promise<DeliveryEntity[]> {
    return this.deliveryRepository.findByEventId(eventId);
  }

  async markProcessing(deliveryId: string): Promise<DeliveryEntity> {
    return this.deliveryRepository.markProcessing(deliveryId);
  }

  async markSucceeded(deliveryId: string): Promise<DeliveryEntity> {
    return this.deliveryRepository.markAttemptOutcome(
      deliveryId,
      DeliveryStatus.SUCCEEDED
    );
  }

  async markFailed(deliveryId: string): Promise<DeliveryEntity> {
    return this.deliveryRepository.markAttemptOutcome(deliveryId, DeliveryStatus.FAILED);
  }
}
