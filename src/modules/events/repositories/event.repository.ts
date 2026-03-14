import { Repository } from 'typeorm';

import {
  finalizeCursorPagination,
  resolveCursorPagination
} from '../../../utils/pagination.util';
import {
  EventEntity,
  EventProcessingStatus
} from '../entities/event.entity';

export interface CreateAcceptedEventInput {
  id: string;
  eventType: string;
  producerReference?: string | null;
  correlationId?: string | null;
  payload: Record<string, unknown>;
  acceptedAt: Date;
}

export type EventListSort =
  | 'acceptedAt:desc'
  | 'acceptedAt:asc'
  | 'lastProcessedAt:desc'
  | 'lastProcessedAt:asc';

export interface EventListFilters {
  event?: string;
  processingStatus?: EventProcessingStatus;
  correlationId?: string;
  producerReference?: string;
  acceptedFrom?: Date;
  acceptedTo?: Date;
  limit: number;
  cursor?: string;
  sort: EventListSort;
}

export interface EventListPage {
  items: EventEntity[];
  nextCursor: string | null;
}

const EVENT_SORT_COLUMN_MAP: Record<EventListSort, keyof EventEntity> = {
  'acceptedAt:desc': 'acceptedAt',
  'acceptedAt:asc': 'acceptedAt',
  'lastProcessedAt:desc': 'lastProcessedAt',
  'lastProcessedAt:asc': 'lastProcessedAt'
};

const EVENT_SORT_DIRECTION_MAP: Record<EventListSort, 'ASC' | 'DESC'> = {
  'acceptedAt:desc': 'DESC',
  'acceptedAt:asc': 'ASC',
  'lastProcessedAt:desc': 'DESC',
  'lastProcessedAt:asc': 'ASC'
};

export class EventRepository {
  constructor(private readonly repository: Repository<EventEntity>) {}

  async createAcceptedEvent(input: CreateAcceptedEventInput): Promise<EventEntity> {
    const event = this.repository.create({
      id: input.id,
      eventType: input.eventType,
      producerReference: input.producerReference ?? null,
      correlationId: input.correlationId ?? null,
      payload: input.payload,
      processingStatus: EventProcessingStatus.ACCEPTED,
      acceptedAt: input.acceptedAt,
      queuedAt: null,
      lastProcessedAt: null,
      finalizedAt: null
    });

    return this.repository.save(event);
  }

  async markQueued(eventId: string, queuedAt: Date): Promise<EventEntity> {
    const event = await this.repository.findOne({ where: { id: eventId } });

    if (!event) {
      throw new Error(`Unable to mark event ${eventId} as queued because it does not exist`);
    }

    event.processingStatus = EventProcessingStatus.QUEUED;
    event.queuedAt = queuedAt;

    return this.repository.save(event);
  }

  async findById(eventId: string): Promise<EventEntity | null> {
    return this.repository.findOne({ where: { id: eventId } });
  }

  async list(filters: EventListFilters): Promise<EventListPage> {
    const { offset, take } = resolveCursorPagination(filters);
    const sortColumn = EVENT_SORT_COLUMN_MAP[filters.sort];
    const sortDirection = EVENT_SORT_DIRECTION_MAP[filters.sort];
    const query = this.repository.createQueryBuilder('event');

    if (filters.event) {
      query.andWhere('event.eventType = :eventType', { eventType: filters.event });
    }

    if (filters.processingStatus) {
      query.andWhere('event.processingStatus = :processingStatus', {
        processingStatus: filters.processingStatus
      });
    }

    if (filters.correlationId) {
      query.andWhere('event.correlationId = :correlationId', {
        correlationId: filters.correlationId
      });
    }

    if (filters.producerReference) {
      query.andWhere('event.producerReference = :producerReference', {
        producerReference: filters.producerReference
      });
    }

    if (filters.acceptedFrom) {
      query.andWhere('event.acceptedAt >= :acceptedFrom', {
        acceptedFrom: filters.acceptedFrom
      });
    }

    if (filters.acceptedTo) {
      query.andWhere('event.acceptedAt <= :acceptedTo', {
        acceptedTo: filters.acceptedTo
      });
    }

    query
      .orderBy(`event.${sortColumn}`, sortDirection)
      .addOrderBy('event.id', sortDirection)
      .skip(offset)
      .take(take);

    const items = await query.getMany();

    return finalizeCursorPagination(items, filters.limit, offset);
  }

  async markProcessing(eventId: string, processedAt: Date): Promise<EventEntity> {
    const event = await this.repository.findOne({ where: { id: eventId } });

    if (!event) {
      throw new Error(`Unable to mark event ${eventId} as processing because it does not exist`);
    }

    event.processingStatus = EventProcessingStatus.PROCESSING;
    event.lastProcessedAt = processedAt;

    return this.repository.save(event);
  }

  async markCompleted(eventId: string, processedAt: Date): Promise<EventEntity> {
    const event = await this.repository.findOne({ where: { id: eventId } });

    if (!event) {
      throw new Error(`Unable to mark event ${eventId} as completed because it does not exist`);
    }

    event.processingStatus = EventProcessingStatus.COMPLETED;
    event.lastProcessedAt = processedAt;
    event.finalizedAt = processedAt;

    return this.repository.save(event);
  }

  async markFailed(eventId: string, processedAt: Date): Promise<EventEntity> {
    const event = await this.repository.findOne({ where: { id: eventId } });

    if (!event) {
      throw new Error(`Unable to mark event ${eventId} as failed because it does not exist`);
    }

    event.processingStatus = EventProcessingStatus.FAILED;
    event.lastProcessedAt = processedAt;
    event.finalizedAt = processedAt;

    return this.repository.save(event);
  }
}
