import { randomUUID } from 'node:crypto';

import { NotFoundError } from '../../../types/app-error';
import { EventProcessingStatus } from '../entities/event.entity';
import {
  EnqueueEventProcessing,
  enqueueEventProcessing as defaultEnqueueEventProcessing
} from '../../../queues/producers/event-processing.producer';
import { CreateEventDto } from '../dto/create-event.dto';
import {
  EventListFilters,
  EventListSort,
  EventRepository
} from '../repositories/event.repository';
import { EventEntity } from '../entities/event.entity';

export interface CreatedEventResult {
  eventId: string;
  status: 'queued';
  correlationId: string;
}

export interface EventDetailResult {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  processingStatus: string;
  correlationId: string | null;
  producerReference: string | null;
  acceptedAt: Date;
  queuedAt: Date | null;
  lastProcessedAt: Date | null;
  finalizedAt: Date | null;
}

export interface EventSummaryResult {
  eventId: string;
  event: string;
  processingStatus: EventProcessingStatus;
  correlationId: string | null;
  producerReference: string | null;
  acceptedAt: Date;
  queuedAt: Date | null;
  lastProcessedAt: Date | null;
}

export interface EventListQuery {
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

export interface EventListResult {
  items: EventSummaryResult[];
  pagination: {
    limit: number;
    nextCursor: string | null;
    sort: EventListSort;
  };
}

export interface CreateEventContext {
  producerReference?: string | null;
}

export class EventService {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly enqueueEventProcessing: EnqueueEventProcessing = defaultEnqueueEventProcessing
  ) {}

  async createEvent(
    input: CreateEventDto,
    context: CreateEventContext = {}
  ): Promise<CreatedEventResult> {
    const eventId = randomUUID();
    const correlationId = input.correlationId ?? randomUUID();
    const acceptedAt = new Date();

    await this.eventRepository.createAcceptedEvent({
      id: eventId,
      eventType: input.event,
      correlationId,
      producerReference: context.producerReference ?? null,
      payload: this.buildPayload(input),
      acceptedAt
    });

    await this.enqueueEventProcessing(eventId, correlationId);
    const queuedEvent = await this.eventRepository.markQueued(eventId, new Date());

    return {
      eventId: queuedEvent.id,
      status: 'queued',
      correlationId
    };
  }

  async listEvents(query: EventListQuery): Promise<EventListResult> {
    const page = await this.eventRepository.list(query as EventListFilters);

    return {
      items: page.items.map((event) => this.toSummary(event)),
      pagination: {
        limit: query.limit,
        nextCursor: page.nextCursor,
        sort: query.sort
      }
    };
  }

  async getEventById(eventId: string): Promise<EventDetailResult> {
    const event = await this.eventRepository.findById(eventId);

    if (!event) {
      throw new NotFoundError('Event not found', 'event_not_found');
    }

    return {
      eventId: event.id,
      eventType: event.eventType,
      payload: event.payload,
      processingStatus: event.processingStatus,
      correlationId: event.correlationId,
      producerReference: event.producerReference,
      acceptedAt: event.acceptedAt,
      queuedAt: event.queuedAt,
      lastProcessedAt: event.lastProcessedAt,
      finalizedAt: event.finalizedAt
    };
  }

  async getStoredEventById(eventId: string): Promise<EventEntity> {
    const event = await this.eventRepository.findById(eventId);

    if (!event) {
      throw new NotFoundError('Event not found', 'event_not_found');
    }

    return event;
  }

  async markProcessing(eventId: string): Promise<void> {
    await this.eventRepository.markProcessing(eventId, new Date());
  }

  async markCompleted(eventId: string): Promise<void> {
    await this.eventRepository.markCompleted(eventId, new Date());
  }

  async markFailed(eventId: string): Promise<void> {
    await this.eventRepository.markFailed(eventId, new Date());
  }

  private toSummary(event: EventEntity): EventSummaryResult {
    return {
      eventId: event.id,
      event: event.eventType,
      processingStatus: event.processingStatus,
      correlationId: event.correlationId,
      producerReference: event.producerReference,
      acceptedAt: event.acceptedAt,
      queuedAt: event.queuedAt,
      lastProcessedAt: event.lastProcessedAt
    };
  }

  private buildPayload(input: CreateEventDto): Record<string, unknown> {
    return {
      ...(input.userId ? { userId: input.userId } : {}),
      data: input.data
    };
  }
}
