import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { DeliveryAttemptEntity } from '../src/modules/delivery-attempts/entities/delivery-attempt.entity';
import { DeliveryEntity } from '../src/modules/deliveries/entities/delivery.entity';
import {
  EventEntity,
  EventProcessingStatus
} from '../src/modules/events/entities/event.entity';
import {
  DeliveryAttemptOutcome,
  DeliveryStatus,
  NotificationChannel,
  SubscriptionStatus
} from '../src/types/notification';
import { SubscriptionEntity } from '../src/modules/subscriptions/entities/subscription.entity';
import { createTestApp, TestAppContext } from './helpers/test-app';

describe('Sprint 5 inspection APIs', () => {
  let context: TestAppContext;

  beforeEach(async () => {
    context = await createTestApp();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  const seedEvent = async (
    overrides: Partial<EventEntity> = {}
  ): Promise<EventEntity> => {
    const eventRepository = context.dataSource.getRepository(EventEntity);

    return eventRepository.save({
      id: randomUUID(),
      eventType: 'order.created',
      producerReference: null,
      correlationId: 'corr-default',
      payload: {
        data: {
          orderId: 'ORD-1'
        }
      },
      processingStatus: EventProcessingStatus.QUEUED,
      acceptedAt: new Date('2026-03-14T08:00:00.000Z'),
      queuedAt: new Date('2026-03-14T08:01:00.000Z'),
      lastProcessedAt: null,
      finalizedAt: null,
      ...overrides
    });
  };

  const seedSubscription = async (
    overrides: Partial<SubscriptionEntity> = {}
  ): Promise<SubscriptionEntity> => {
    const subscriptionRepository = context.dataSource.getRepository(SubscriptionEntity);

    return subscriptionRepository.save({
      id: randomUUID(),
      eventType: 'order.created',
      channel: NotificationChannel.EMAIL,
      target: 'ops@example.com',
      status: SubscriptionStatus.ACTIVE,
      ...overrides
    });
  };

  const seedDelivery = async (
    event: EventEntity,
    subscription: SubscriptionEntity,
    overrides: Partial<DeliveryEntity> = {}
  ): Promise<DeliveryEntity> => {
    const deliveryRepository = context.dataSource.getRepository(DeliveryEntity);

    return deliveryRepository.save({
      id: randomUUID(),
      eventId: event.id,
      subscriptionId: subscription.id,
      channel: subscription.channel,
      target: subscription.target,
      status: DeliveryStatus.PENDING,
      attemptCount: 0,
      retryCount: 0,
      maxRetryLimit: 3,
      nextRetryAt: null,
      lastErrorSummary: null,
      failureCategory: null,
      completedAt: null,
      createdAt: new Date('2026-03-14T08:02:00.000Z'),
      updatedAt: new Date('2026-03-14T08:02:00.000Z'),
      ...overrides
    });
  };

  const seedAttempt = async (
    delivery: DeliveryEntity,
    overrides: Partial<DeliveryAttemptEntity> = {}
  ): Promise<DeliveryAttemptEntity> => {
    const attemptRepository = context.dataSource.getRepository(DeliveryAttemptEntity);

    return attemptRepository.save({
      id: randomUUID(),
      deliveryId: delivery.id,
      attemptSequence: 1,
      channel: delivery.channel,
      providerName: 'test-provider',
      outcome: DeliveryAttemptOutcome.SUCCESS,
      failureCategory: null,
      errorMessage: null,
      providerResponseSummary: 'Accepted',
      attemptedAt: new Date('2026-03-14T08:03:00.000Z'),
      ...overrides
    });
  };

  it('GET /events returns event summaries', async () => {
    await seedEvent({
      correlationId: 'corr-1',
      acceptedAt: new Date('2026-03-14T07:00:00.000Z')
    });
    await seedEvent({
      eventType: 'invoice.created',
      correlationId: 'corr-2',
      acceptedAt: new Date('2026-03-14T09:00:00.000Z')
    });

    const response = await request(context.app)
      .get('/events?limit=10&sort=acceptedAt:asc')
      .set(context.authHeaders.admin)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0]).toEqual({
      eventId: expect.any(String),
      event: 'order.created',
      processingStatus: 'queued',
      correlationId: 'corr-1',
      producerReference: null,
      acceptedAt: expect.any(String),
      queuedAt: expect.any(String),
      lastProcessedAt: null
    });
    expect(response.body.meta).toEqual({
      requestId: expect.any(String),
      pagination: {
        limit: 10,
        nextCursor: null,
        sort: 'acceptedAt:asc'
      }
    });
  });

  it('GET /events supports filtering by status and correlationId', async () => {
    await seedEvent({
      correlationId: 'corr-match',
      processingStatus: EventProcessingStatus.COMPLETED,
      lastProcessedAt: new Date('2026-03-14T09:00:00.000Z'),
      finalizedAt: new Date('2026-03-14T09:00:00.000Z')
    });
    await seedEvent({
      correlationId: 'corr-other',
      processingStatus: EventProcessingStatus.FAILED,
      lastProcessedAt: new Date('2026-03-14T09:10:00.000Z'),
      finalizedAt: new Date('2026-03-14T09:10:00.000Z')
    });

    const response = await request(context.app)
      .get('/events?processingStatus=completed&correlationId=corr-match')
      .set(context.authHeaders.admin)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({
        processingStatus: 'completed',
        correlationId: 'corr-match'
      })
    );
  });

  it('GET /deliveries returns delivery summaries', async () => {
    const event = await seedEvent({ correlationId: 'corr-delivery' });
    const emailSubscription = await seedSubscription({
      channel: NotificationChannel.EMAIL,
      target: 'ops@example.com'
    });
    const webhookSubscription = await seedSubscription({
      id: randomUUID(),
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/hook?secret=value'
    });

    await seedDelivery(event, emailSubscription, {
      status: DeliveryStatus.SUCCEEDED,
      attemptCount: 1,
      completedAt: new Date('2026-03-14T08:04:00.000Z')
    });
    await seedDelivery(event, webhookSubscription, {
      status: DeliveryStatus.RETRYING,
      retryCount: 1,
      nextRetryAt: new Date('2026-03-14T08:10:00.000Z'),
      failureCategory: 'provider_temporary_failure'
    });

    const response = await request(context.app)
      .get('/deliveries?limit=10&sort=createdAt:asc')
      .set(context.authHeaders.admin)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(2);
    expect(
      response.body.data.find((item: { channel: string }) => item.channel === 'email')
    ).toEqual(
      expect.objectContaining({
        deliveryId: expect.any(String),
        eventId: event.id,
        subscriptionId: emailSubscription.id,
        channel: 'email',
        target: 'o**@example.com',
        status: 'succeeded',
        retryCount: 0,
        maxRetryLimit: 3,
        nextRetryAt: null,
        failureCategory: null,
        correlationId: 'corr-delivery',
        completedAt: expect.any(String)
      })
    );
    expect(
      response.body.data.find((item: { channel: string }) => item.channel === 'webhook')
        .target
    ).toBe('https://example.com/hook');
    expect(response.body.meta.pagination).toEqual({
      limit: 10,
      nextCursor: null,
      sort: 'createdAt:asc'
    });
  });

  it('GET /deliveries supports filtering by status and channel', async () => {
    const event = await seedEvent({ correlationId: 'corr-filter' });
    const emailSubscription = await seedSubscription({
      channel: NotificationChannel.EMAIL,
      target: 'ops@example.com'
    });
    const smsSubscription = await seedSubscription({
      id: randomUUID(),
      channel: NotificationChannel.SMS,
      target: '+2348012345678'
    });

    await seedDelivery(event, emailSubscription, {
      status: DeliveryStatus.SUCCEEDED,
      attemptCount: 1,
      completedAt: new Date('2026-03-14T08:04:00.000Z')
    });
    await seedDelivery(event, smsSubscription, {
      status: DeliveryStatus.FAILED,
      attemptCount: 1,
      completedAt: new Date('2026-03-14T08:05:00.000Z')
    });

    const response = await request(context.app)
      .get('/deliveries?status=failed&channel=sms')
      .set(context.authHeaders.admin)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({
        channel: 'sms',
        status: 'failed'
      })
    );
  });

  it('GET /deliveries/:deliveryId returns a single delivery', async () => {
    const event = await seedEvent({ correlationId: 'corr-detail' });
    const subscription = await seedSubscription({
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/path?token=secret'
    });
    const delivery = await seedDelivery(event, subscription, {
      status: DeliveryStatus.RETRYING,
      attemptCount: 1,
      retryCount: 1,
      nextRetryAt: new Date('2026-03-14T08:10:00.000Z'),
      lastErrorSummary: 'Temporary outage',
      failureCategory: 'provider_temporary_failure'
    });

    const response = await request(context.app)
      .get(`/deliveries/${delivery.id}`)
      .set(context.authHeaders.admin)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        deliveryId: delivery.id,
        eventId: event.id,
        subscriptionId: subscription.id,
        channel: 'webhook',
        target: 'https://example.com/path',
        status: 'retrying',
        attemptCount: 1,
        retryCount: 1,
        maxRetryLimit: 3,
        nextRetryAt: expect.any(String),
        lastErrorSummary: 'Temporary outage',
        failureCategory: 'provider_temporary_failure',
        correlationId: 'corr-detail',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        completedAt: null,
        links: {
          attempts: `/deliveries/${delivery.id}/attempts`
        }
      },
      meta: {
        requestId: expect.any(String)
      }
    });
  });

  it('GET /deliveries/:deliveryId returns 404 when missing', async () => {
    const response = await request(context.app)
      .get(`/deliveries/${randomUUID()}`)
      .set(context.authHeaders.admin)
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Delivery not found',
        code: 'delivery_not_found'
      }
    });
  });

  it('GET /deliveries/:deliveryId/attempts returns attempts in sequence order', async () => {
    const event = await seedEvent();
    const subscription = await seedSubscription();
    const delivery = await seedDelivery(event, subscription, {
      status: DeliveryStatus.SUCCEEDED,
      attemptCount: 2,
      completedAt: new Date('2026-03-14T08:05:00.000Z')
    });

    await seedAttempt(delivery, {
      attemptSequence: 1,
      outcome: DeliveryAttemptOutcome.FAILURE,
      failureCategory: 'network_error',
      errorMessage: 'Timeout while sending',
      providerResponseSummary: 'Timed out',
      attemptedAt: new Date('2026-03-14T08:03:00.000Z')
    });
    await seedAttempt(delivery, {
      attemptSequence: 2,
      outcome: DeliveryAttemptOutcome.SUCCESS,
      failureCategory: null,
      errorMessage: null,
      providerResponseSummary: 'Accepted',
      attemptedAt: new Date('2026-03-14T08:04:00.000Z')
    });

    const response = await request(context.app)
      .get(`/deliveries/${delivery.id}/attempts?sort=attemptedAt:asc`)
      .set(context.authHeaders.admin)
      .expect(200);

    expect(response.body.data).toHaveLength(2);
    expect(response.body.data.map((attempt: { attemptSequence: number }) => attempt.attemptSequence)).toEqual([
      1,
      2
    ]);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({
        deliveryId: delivery.id,
        outcome: 'failure',
        failureCategory: 'network_error',
        errorMessage: 'Timeout while sending',
        providerResponseSummary: 'Timed out'
      })
    );
  });

  it('GET /events/:eventId/deliveries returns derived deliveries', async () => {
    const event = await seedEvent({ correlationId: 'corr-event-delivery' });
    const subscription = await seedSubscription({
      channel: NotificationChannel.SMS,
      target: '+2348012345678'
    });

    await seedDelivery(event, subscription, {
      status: DeliveryStatus.FAILED,
      attemptCount: 1,
      failureCategory: 'invalid_destination',
      lastErrorSummary: 'Destination rejected',
      completedAt: new Date('2026-03-14T08:06:00.000Z')
    });

    const response = await request(context.app)
      .get(`/events/${event.id}/deliveries?status=failed&channel=sms`)
      .set(context.authHeaders.admin)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toEqual(
      expect.objectContaining({
        eventId: event.id,
        channel: 'sms',
        status: 'failed',
        correlationId: 'corr-event-delivery'
      })
    );
  });

  it('GET /events/:eventId/deliveries returns 404 when event missing', async () => {
    const response = await request(context.app)
      .get(`/events/${randomUUID()}/deliveries`)
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

  it('pagination behavior works consistently for list endpoints', async () => {
    const firstEvent = await seedEvent({
      eventType: 'order.created',
      acceptedAt: new Date('2026-03-14T06:00:00.000Z')
    });
    await seedEvent({
      eventType: 'order.cancelled',
      acceptedAt: new Date('2026-03-14T07:00:00.000Z')
    });

    const firstPage = await request(context.app)
      .get('/events?limit=1&sort=acceptedAt:asc')
      .set(context.authHeaders.admin)
      .expect(200);

    expect(firstPage.body.data).toHaveLength(1);
    expect(firstPage.body.data[0].eventId).toBe(firstEvent.id);
    expect(firstPage.body.meta.pagination.nextCursor).toEqual(expect.any(String));

    const secondPage = await request(context.app)
      .get(
        `/events?limit=1&sort=acceptedAt:asc&cursor=${encodeURIComponent(firstPage.body.meta.pagination.nextCursor)}`
      )
      .set(context.authHeaders.admin)
      .expect(200);

    expect(secondPage.body.data).toHaveLength(1);
    expect(secondPage.body.data[0].eventId).not.toBe(firstEvent.id);
  });

  it('invalid query parameters are rejected cleanly', async () => {
    const response = await request(context.app)
      .get('/deliveries?limit=0')
      .set(context.authHeaders.admin)
      .expect(422);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Request validation failed',
        code: 'validation_error'
      }
    });
  });

  it('response envelopes remain consistent for list and detail inspection endpoints', async () => {
    const event = await seedEvent({ correlationId: 'corr-envelope' });
    const subscription = await seedSubscription();
    const delivery = await seedDelivery(event, subscription);

    const listResponse = await request(context.app)
      .get('/events?limit=5')
      .set(context.authHeaders.admin)
      .expect(200);

    const detailResponse = await request(context.app)
      .get(`/deliveries/${delivery.id}`)
      .set(context.authHeaders.admin)
      .expect(200);

    expect(listResponse.body.meta).toEqual({
      requestId: expect.any(String),
      pagination: {
        limit: 5,
        nextCursor: null,
        sort: 'acceptedAt:desc'
      }
    });
    expect(detailResponse.body.meta).toEqual({
      requestId: expect.any(String)
    });
  });
});
