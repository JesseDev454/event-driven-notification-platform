import { randomUUID } from 'node:crypto';

import { SubscriptionEntity } from '../../subscriptions/entities/subscription.entity';
import { DeliveryStatus } from '../../../types/notification';
import { DeliveryRepository } from '../repositories/delivery.repository';
import { DeliveryEntity } from '../entities/delivery.entity';

export interface EventDeliverySummary {
  deliveries: DeliveryEntity[];
  succeededDeliveries: number;
  failedDeliveries: number;
  eventStatus: 'completed' | 'failed' | 'processing';
}

export class DeliveryService {
  constructor(
    private readonly deliveryRepository: DeliveryRepository,
    private readonly defaultMaxRetryLimit = 3
  ) {}

  async getOrCreateDelivery(
    eventId: string,
    subscription: SubscriptionEntity
  ): Promise<DeliveryEntity> {
    return this.deliveryRepository.findOrCreate({
      id: randomUUID(),
      eventId,
      subscriptionId: subscription.id,
      channel: subscription.channel,
      target: subscription.target,
      maxRetryLimit: this.defaultMaxRetryLimit
    });
  }

  async getDeliveriesForEvent(eventId: string): Promise<DeliveryEntity[]> {
    return this.deliveryRepository.findByEventId(eventId);
  }

  async getDeliveryById(deliveryId: string): Promise<DeliveryEntity | null> {
    return this.deliveryRepository.findById(deliveryId);
  }

  async getDeliveryForEventAndSubscription(
    eventId: string,
    subscriptionId: string
  ): Promise<DeliveryEntity | null> {
    return this.deliveryRepository.findByEventIdAndSubscriptionId(
      eventId,
      subscriptionId
    );
  }

  async markProcessing(deliveryId: string): Promise<DeliveryEntity> {
    return this.deliveryRepository.markProcessing(deliveryId);
  }

  async markRetrying(
    deliveryId: string,
    retryCount: number,
    nextRetryAt: Date,
    failureCategory: string | null,
    lastErrorSummary: string | null
  ): Promise<DeliveryEntity> {
    return this.deliveryRepository.markRetrying({
      deliveryId,
      retryCount,
      nextRetryAt,
      failureCategory,
      lastErrorSummary
    });
  }

  async markSucceeded(deliveryId: string): Promise<DeliveryEntity> {
    return this.deliveryRepository.markAttemptOutcome({
      deliveryId,
      status: DeliveryStatus.SUCCEEDED
    });
  }

  async markFailed(
    deliveryId: string,
    failureCategory: string | null,
    lastErrorSummary: string | null
  ): Promise<DeliveryEntity> {
    return this.deliveryRepository.markAttemptOutcome({
      deliveryId,
      status: DeliveryStatus.FAILED,
      failureCategory,
      lastErrorSummary
    });
  }

  async getEventDeliverySummary(eventId: string): Promise<EventDeliverySummary> {
    const deliveries = await this.deliveryRepository.findByEventId(eventId);
    const succeededDeliveries = deliveries.filter(
      (delivery) => delivery.status === DeliveryStatus.SUCCEEDED
    ).length;
    const failedDeliveries = deliveries.filter(
      (delivery) => delivery.status === DeliveryStatus.FAILED
    ).length;

    if (failedDeliveries > 0) {
      return {
        deliveries,
        succeededDeliveries,
        failedDeliveries,
        eventStatus: 'failed'
      };
    }

    if (
      deliveries.length > 0 &&
      deliveries.every((delivery) => delivery.status === DeliveryStatus.SUCCEEDED)
    ) {
      return {
        deliveries,
        succeededDeliveries,
        failedDeliveries,
        eventStatus: 'completed'
      };
    }

    return {
      deliveries,
      succeededDeliveries,
      failedDeliveries,
      eventStatus: 'processing'
    };
  }
}
