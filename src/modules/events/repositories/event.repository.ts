import { Repository } from 'typeorm';

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
