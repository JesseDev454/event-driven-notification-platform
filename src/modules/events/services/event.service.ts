import { randomUUID } from 'node:crypto';

import { NotFoundError } from '../../../types/app-error';
import {
  EnqueueEventProcessing,
  enqueueEventProcessing as defaultEnqueueEventProcessing
} from '../../../queues/producers/event-processing.producer';
import { CreateEventDto } from '../dto/create-event.dto';
import { EventRepository } from '../repositories/event.repository';

export interface CreatedEventResult {
  eventId: string;
  status: 'queued';
}

export interface EventDetailResult {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  processingStatus: string;
  acceptedAt: Date;
  queuedAt: Date | null;
}

export class EventService {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly enqueueEventProcessing: EnqueueEventProcessing = defaultEnqueueEventProcessing
  ) {}

  async createEvent(input: CreateEventDto): Promise<CreatedEventResult> {
    const eventId = randomUUID();
    const correlationId = input.correlationId ?? randomUUID();
    const acceptedAt = new Date();

    await this.eventRepository.createAcceptedEvent({
      id: eventId,
      eventType: input.event,
      correlationId,
      producerReference: null,
      payload: this.buildPayload(input),
      acceptedAt
    });

    await this.enqueueEventProcessing(eventId, correlationId);
    const queuedEvent = await this.eventRepository.markQueued(eventId, new Date());

    return {
      eventId: queuedEvent.id,
      status: 'queued'
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
      acceptedAt: event.acceptedAt,
      queuedAt: event.queuedAt
    };
  }

  private buildPayload(input: CreateEventDto): Record<string, unknown> {
    return {
      ...(input.userId ? { userId: input.userId } : {}),
      data: input.data
    };
  }
}
