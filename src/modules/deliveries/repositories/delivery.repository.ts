import { QueryFailedError, Repository } from 'typeorm';

import {
  finalizeCursorPagination,
  resolveCursorPagination
} from '../../../utils/pagination.util';
import { DeliveryStatus, NotificationChannel } from '../../../types/notification';
import { DeliveryEntity } from '../entities/delivery.entity';

export interface CreateDeliveryInput {
  id: string;
  eventId: string;
  subscriptionId: string;
  channel: NotificationChannel;
  target: string;
  maxRetryLimit: number;
}

export interface MarkRetryingInput {
  deliveryId: string;
  retryCount: number;
  nextRetryAt: Date;
  failureCategory: string | null;
  lastErrorSummary: string | null;
}

export interface MarkFinalAttemptOutcomeInput {
  deliveryId: string;
  status: DeliveryStatus.SUCCEEDED | DeliveryStatus.FAILED;
  failureCategory?: string | null;
  lastErrorSummary?: string | null;
}

export type DeliveryInspectionSort =
  | 'createdAt:desc'
  | 'createdAt:asc'
  | 'updatedAt:desc'
  | 'updatedAt:asc';

export interface DeliveryInspectionFilters {
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

export interface DeliveryInspectionPage {
  items: DeliveryEntity[];
  nextCursor: string | null;
}

const DELIVERY_SORT_COLUMN_MAP: Record<DeliveryInspectionSort, 'createdAt' | 'updatedAt'> = {
  'createdAt:desc': 'createdAt',
  'createdAt:asc': 'createdAt',
  'updatedAt:desc': 'updatedAt',
  'updatedAt:asc': 'updatedAt'
};

const DELIVERY_SORT_DIRECTION_MAP: Record<DeliveryInspectionSort, 'ASC' | 'DESC'> = {
  'createdAt:desc': 'DESC',
  'createdAt:asc': 'ASC',
  'updatedAt:desc': 'DESC',
  'updatedAt:asc': 'ASC'
};

const isUniqueConstraintError = (error: unknown): boolean => {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';

  return message.includes('unique') || message.includes('duplicate');
};

export class DeliveryRepository {
  constructor(private readonly repository: Repository<DeliveryEntity>) {}

  async create(input: CreateDeliveryInput): Promise<DeliveryEntity> {
    const delivery = this.repository.create({
      id: input.id,
      eventId: input.eventId,
      subscriptionId: input.subscriptionId,
      channel: input.channel,
      target: input.target,
      status: DeliveryStatus.PENDING,
      attemptCount: 0,
      retryCount: 0,
      maxRetryLimit: input.maxRetryLimit,
      nextRetryAt: null,
      lastErrorSummary: null,
      failureCategory: null,
      completedAt: null
    });

    return this.repository.save(delivery);
  }

  async findByEventId(eventId: string): Promise<DeliveryEntity[]> {
    return this.repository.find({
      where: { eventId },
      order: { createdAt: 'ASC' }
    });
  }

  async findById(deliveryId: string): Promise<DeliveryEntity | null> {
    return this.repository.findOne({ where: { id: deliveryId } });
  }

  async findInspectionById(deliveryId: string): Promise<DeliveryEntity | null> {
    return this.repository
      .createQueryBuilder('delivery')
      .leftJoinAndSelect('delivery.event', 'event')
      .where('delivery.id = :deliveryId', { deliveryId })
      .getOne();
  }

  async listInspection(
    filters: DeliveryInspectionFilters
  ): Promise<DeliveryInspectionPage> {
    const { offset, take } = resolveCursorPagination(filters);
    const sortColumn = DELIVERY_SORT_COLUMN_MAP[filters.sort];
    const sortDirection = DELIVERY_SORT_DIRECTION_MAP[filters.sort];
    const query = this.repository
      .createQueryBuilder('delivery')
      .leftJoinAndSelect('delivery.event', 'event');

    if (filters.eventId) {
      query.andWhere('delivery.eventId = :eventId', { eventId: filters.eventId });
    }

    if (filters.subscriptionId) {
      query.andWhere('delivery.subscriptionId = :subscriptionId', {
        subscriptionId: filters.subscriptionId
      });
    }

    if (filters.status) {
      query.andWhere('delivery.status = :status', { status: filters.status });
    }

    if (filters.channel) {
      query.andWhere('delivery.channel = :channel', { channel: filters.channel });
    }

    if (filters.correlationId) {
      query.andWhere('event.correlationId = :correlationId', {
        correlationId: filters.correlationId
      });
    }

    if (filters.createdFrom) {
      query.andWhere('delivery.createdAt >= :createdFrom', {
        createdFrom: filters.createdFrom
      });
    }

    if (filters.createdTo) {
      query.andWhere('delivery.createdAt <= :createdTo', {
        createdTo: filters.createdTo
      });
    }

    if (filters.updatedFrom) {
      query.andWhere('delivery.updatedAt >= :updatedFrom', {
        updatedFrom: filters.updatedFrom
      });
    }

    if (filters.updatedTo) {
      query.andWhere('delivery.updatedAt <= :updatedTo', {
        updatedTo: filters.updatedTo
      });
    }

    query
      .orderBy(`delivery.${sortColumn}`, sortDirection)
      .addOrderBy('delivery.id', sortDirection)
      .skip(offset)
      .take(take);

    const items = await query.getMany();

    return finalizeCursorPagination(items, filters.limit, offset);
  }

  async findByEventIdAndSubscriptionId(
    eventId: string,
    subscriptionId: string
  ): Promise<DeliveryEntity | null> {
    return this.repository.findOne({
      where: {
        eventId,
        subscriptionId
      }
    });
  }

  async findOrCreate(input: CreateDeliveryInput): Promise<DeliveryEntity> {
    const existing = await this.findByEventIdAndSubscriptionId(
      input.eventId,
      input.subscriptionId
    );

    if (existing) {
      return existing;
    }

    try {
      return await this.create(input);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const duplicate = await this.findByEventIdAndSubscriptionId(
          input.eventId,
          input.subscriptionId
        );

        if (duplicate) {
          return duplicate;
        }
      }

      throw error;
    }
  }

  async markProcessing(deliveryId: string): Promise<DeliveryEntity> {
    const delivery = await this.findById(deliveryId);

    if (!delivery) {
      throw new Error(
        `Unable to mark delivery ${deliveryId} as processing because it does not exist`
      );
    }

    delivery.status = DeliveryStatus.PROCESSING;
    delivery.nextRetryAt = null;
    delivery.completedAt = null;

    return this.repository.save(delivery);
  }

  async markRetrying(input: MarkRetryingInput): Promise<DeliveryEntity> {
    const delivery = await this.findById(input.deliveryId);

    if (!delivery) {
      throw new Error(
        `Unable to mark delivery ${input.deliveryId} as retrying because it does not exist`
      );
    }

    delivery.status = DeliveryStatus.RETRYING;
    delivery.attemptCount += 1;
    delivery.retryCount = input.retryCount;
    delivery.nextRetryAt = input.nextRetryAt;
    delivery.failureCategory = input.failureCategory;
    delivery.lastErrorSummary = input.lastErrorSummary;
    delivery.completedAt = null;

    return this.repository.save(delivery);
  }

  async markAttemptOutcome(
    input: MarkFinalAttemptOutcomeInput
  ): Promise<DeliveryEntity> {
    const delivery = await this.findById(input.deliveryId);

    if (!delivery) {
      throw new Error(
        `Unable to mark delivery ${input.deliveryId} with final outcome because it does not exist`
      );
    }

    delivery.status = input.status;
    delivery.failureCategory =
      input.status === DeliveryStatus.SUCCEEDED
        ? null
        : input.failureCategory ?? null;
    delivery.lastErrorSummary =
      input.status === DeliveryStatus.SUCCEEDED
        ? null
        : input.lastErrorSummary ?? null;
    delivery.nextRetryAt = null;
    delivery.completedAt = new Date();
    delivery.attemptCount += 1;

    return this.repository.save(delivery);
  }
}
