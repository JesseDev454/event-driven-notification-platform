import { NotFoundError } from '../../../types/app-error';
import { DeliveryStatus, NotificationChannel } from '../../../types/notification';
import {
  DeliveryAttemptInspectionSort,
  DeliveryAttemptRepository
} from '../../delivery-attempts/repositories/delivery-attempt.repository';
import { toSafeSummary, toSafeNotificationTarget } from '../../../utils/inspection.util';
import {
  DeliveryInspectionFilters,
  DeliveryInspectionSort,
  DeliveryRepository
} from '../repositories/delivery.repository';
import { DeliveryEntity } from '../entities/delivery.entity';

export interface DeliveryListQuery {
  eventId?: string;
  subscriptionId?: string;
  status?: DeliveryStatus;
  channel?: NotificationChannel;
  correlationId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  updatedFrom?: Date;
  updatedTo?: Date;
  limit: number;
  cursor?: string;
  sort: DeliveryInspectionSort;
}

export interface DeliverySummaryResult {
  deliveryId: string;
  eventId: string;
  subscriptionId: string;
  channel: NotificationChannel;
  target: string;
  status: DeliveryStatus;
  retryCount: number;
  maxRetryLimit: number;
  nextRetryAt: Date | null;
  failureCategory: string | null;
  correlationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface DeliveryListResult {
  items: DeliverySummaryResult[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    sort: DeliveryInspectionSort;
  };
}

export interface DeliveryDetailResult extends DeliverySummaryResult {
  attemptCount: number;
  lastErrorSummary: string | null;
  links: {
    attempts: string;
  };
}

export interface DeliveryAttemptListQuery {
  limit: number;
  cursor?: string;
  sort: DeliveryAttemptInspectionSort;
}

export interface DeliveryAttemptResult {
  deliveryAttemptId: string;
  deliveryId: string;
  attemptSequence: number;
  channel: NotificationChannel;
  providerName: string;
  outcome: string;
  failureCategory: string | null;
  errorMessage: string | null;
  providerResponseSummary: string | null;
  attemptedAt: Date;
}

export interface DeliveryAttemptListResult {
  items: DeliveryAttemptResult[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    sort: DeliveryAttemptInspectionSort;
  };
}

export class DeliveryInspectionService {
  constructor(
    private readonly deliveryRepository: DeliveryRepository,
    private readonly deliveryAttemptRepository: DeliveryAttemptRepository
  ) {}

  async listDeliveries(query: DeliveryListQuery): Promise<DeliveryListResult> {
    const page = await this.deliveryRepository.listInspection(
      query as DeliveryInspectionFilters
    );

    return {
      items: page.items.map((delivery) => this.toSummary(delivery)),
      pagination: {
        limit: query.limit,
        nextCursor: page.nextCursor,
        sort: query.sort
      }
    };
  }

  async getDeliveryById(deliveryId: string): Promise<DeliveryDetailResult> {
    const delivery = await this.deliveryRepository.findInspectionById(deliveryId);

    if (!delivery) {
      throw new NotFoundError('Delivery not found', 'delivery_not_found');
    }

    return {
      ...this.toSummary(delivery),
      attemptCount: delivery.attemptCount,
      lastErrorSummary: toSafeSummary(delivery.lastErrorSummary),
      links: {
        attempts: `/deliveries/${delivery.id}/attempts`
      }
    };
  }

  async listAttemptsForDelivery(
    deliveryId: string,
    query: DeliveryAttemptListQuery
  ): Promise<DeliveryAttemptListResult> {
    const delivery = await this.deliveryRepository.findById(deliveryId);

    if (!delivery) {
      throw new NotFoundError('Delivery not found', 'delivery_not_found');
    }

    const page = await this.deliveryAttemptRepository.listByDeliveryId({
      deliveryId,
      limit: query.limit,
      cursor: query.cursor,
      sort: query.sort
    });

    return {
      items: page.items.map((attempt) => ({
        deliveryAttemptId: attempt.id,
        deliveryId: attempt.deliveryId,
        attemptSequence: attempt.attemptSequence,
        channel: attempt.channel,
        providerName: attempt.providerName,
        outcome: attempt.outcome,
        failureCategory: attempt.failureCategory,
        errorMessage: toSafeSummary(attempt.errorMessage),
        providerResponseSummary: toSafeSummary(attempt.providerResponseSummary),
        attemptedAt: attempt.attemptedAt
      })),
      pagination: {
        limit: query.limit,
        nextCursor: page.nextCursor,
        sort: query.sort
      }
    };
  }

  private toSummary(delivery: DeliveryEntity): DeliverySummaryResult {
    return {
      deliveryId: delivery.id,
      eventId: delivery.eventId,
      subscriptionId: delivery.subscriptionId,
      channel: delivery.channel,
      target: toSafeNotificationTarget(delivery.channel, delivery.target),
      status: delivery.status,
      retryCount: delivery.retryCount,
      maxRetryLimit: delivery.maxRetryLimit,
      nextRetryAt: delivery.nextRetryAt,
      failureCategory: delivery.failureCategory,
      correlationId: delivery.event?.correlationId ?? null,
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
      completedAt: delivery.completedAt
    };
  }
}
