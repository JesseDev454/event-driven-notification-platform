import { randomUUID } from 'node:crypto';

import request from 'supertest';

import {
  EventEntity,
  EventProcessingStatus
} from '../src/modules/events/entities/event.entity';
import { createTestApp, TestAppContext } from './helpers/test-app';

describe('Sprint 1 event ingestion flow', () => {
  let context: TestAppContext;

  beforeEach(async () => {
    context = await createTestApp();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('accepts a valid event, stores it durably, and queues processing', async () => {
    const response = await request(context.app)
      .post('/events')
      .set(context.authHeaders.producer)
      .send({
        event: 'order.created',
        userId: '123',
        data: {
          orderId: 'ORD-555',
          amount: 250
        }
      })
      .expect(201);

    expect(response.body).toEqual({
      success: true,
      data: {
        eventId: expect.any(String),
        status: 'queued'
      }
    });
    expect(response.headers['x-request-id']).toEqual(expect.any(String));

    const event = await context.dataSource
      .getRepository(EventEntity)
      .findOneByOrFail({ id: response.body.data.eventId });

    expect(event.eventType).toBe('order.created');
    expect(event.payload).toEqual({
      userId: '123',
      data: {
        orderId: 'ORD-555',
        amount: 250
      }
    });
    expect(event.processingStatus).toBe(EventProcessingStatus.QUEUED);
    expect(event.acceptedAt).toBeInstanceOf(Date);
    expect(event.queuedAt).toBeInstanceOf(Date);
    expect(context.enqueueEventProcessing).toHaveBeenCalledTimes(1);
    expect(context.enqueueEventProcessing).toHaveBeenCalledWith(
      response.body.data.eventId,
      expect.any(String)
    );
  });

  it('rejects invalid event payloads', async () => {
    const response = await request(context.app)
      .post('/events')
      .set(context.authHeaders.producer)
      .send({
        event: 123,
        data: 'invalid-payload'
      })
      .expect(422);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Request validation failed',
        code: 'validation_error'
      }
    });
    expect(context.enqueueEventProcessing).not.toHaveBeenCalled();

    const storedEvents = await context.dataSource.getRepository(EventEntity).count();
    expect(storedEvents).toBe(0);
  });

  it('returns an event by identifier', async () => {
    const createResponse = await request(context.app)
      .post('/events')
      .set(context.authHeaders.producer)
      .send({
        event: 'invoice.created',
        data: {
          invoiceId: 'INV-100'
        }
      })
      .expect(201);

    const response = await request(context.app)
      .get(`/events/${createResponse.body.data.eventId}`)
      .set(context.authHeaders.admin)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        eventId: createResponse.body.data.eventId,
        eventType: 'invoice.created',
        payload: {
          data: {
            invoiceId: 'INV-100'
          }
        },
        processingStatus: 'queued',
        correlationId: expect.any(String),
        producerReference: 'authenticated-producer',
        acceptedAt: expect.any(String),
        queuedAt: expect.any(String),
        lastProcessedAt: null,
        finalizedAt: null
      },
      meta: {
        requestId: expect.any(String)
      }
    });
  });

  it('returns not found when the event does not exist', async () => {
    const response = await request(context.app)
      .get(`/events/${randomUUID()}`)
      .set(context.authHeaders.admin)
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Event not found',
        code: 'event_not_found'
      }
    });
  });

  it('triggers event queueing after ingestion', async () => {
    const response = await request(context.app)
      .post('/events')
      .set(context.authHeaders.producer)
      .send({
        event: 'payment.received',
        data: {
          paymentId: 'PAY-42',
          amount: 900
        }
      })
      .expect(201);

    expect(context.enqueueEventProcessing).toHaveBeenCalledTimes(1);
    expect(context.enqueueEventProcessing).toHaveBeenCalledWith(
      response.body.data.eventId,
      expect.any(String)
    );
  });
});
