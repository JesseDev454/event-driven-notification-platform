import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { DeliveryEntity } from '../src/modules/deliveries/entities/delivery.entity';
import {
  EventEntity,
  EventProcessingStatus
} from '../src/modules/events/entities/event.entity';
import {
  DeliveryStatus,
  NotificationChannel,
  SubscriptionStatus
} from '../src/types/notification';
import { SubscriptionEntity } from '../src/modules/subscriptions/entities/subscription.entity';
import { createTestApp, TestAppContext } from './helpers/test-app';

describe('Sprint 6 security hardening', () => {
  let context: TestAppContext;

  beforeEach(async () => {
    context = await createTestApp();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('POST /events rejects missing producer auth with a consistent error shape', async () => {
    const response = await request(context.app)
      .post('/events')
      .send({
        event: 'order.created',
        data: {
          orderId: 'ORD-UNAUTH-1'
        }
      })
      .expect(401);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Producer authentication required',
        code: 'producer_auth_required'
      }
    });
  });

  it('POST /events rejects invalid producer auth', async () => {
    const response = await request(context.app)
      .post('/events')
      .set('x-producer-api-key', 'wrong-producer-key')
      .send({
        event: 'order.created',
        data: {
          orderId: 'ORD-UNAUTH-2'
        }
      })
      .expect(401);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Producer authentication required',
        code: 'producer_auth_required'
      }
    });
  });

  it('POST /events accepts valid producer auth, stores producerReference, and propagates correlation headers', async () => {
    const response = await request(context.app)
      .post('/events')
      .set({
        ...context.authHeaders.producer,
        'x-producer-reference': 'checkout-service',
        'x-correlation-id': 'corr-producer-1'
      })
      .send({
        event: 'order.created',
        data: {
          orderId: 'ORD-AUTH-1'
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
    expect(response.headers['x-correlation-id']).toBe('corr-producer-1');

    const event = await context.dataSource
      .getRepository(EventEntity)
      .findOneByOrFail({ id: response.body.data.eventId });

    expect(event.producerReference).toBe('checkout-service');
    expect(event.correlationId).toBe('corr-producer-1');
  });

  it('subscription APIs reject missing admin auth', async () => {
    const response = await request(context.app)
      .post('/subscriptions')
      .send({
        eventType: 'order.created',
        channel: 'email',
        target: 'ops@example.com'
      })
      .expect(401);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Admin authentication required',
        code: 'admin_auth_required'
      }
    });
  });

  it('inspection APIs reject invalid admin auth', async () => {
    const response = await request(context.app)
      .get('/events')
      .set('x-admin-api-key', 'wrong-admin-key')
      .expect(401);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Admin authentication required',
        code: 'admin_auth_required'
      }
    });
  });

  it('valid admin auth allows subscription and inspection access', async () => {
    await request(context.app)
      .post('/subscriptions')
      .set(context.authHeaders.admin)
      .send({
        eventType: 'order.created',
        channel: 'email',
        target: 'ops@example.com'
      })
      .expect(201);

    const response = await request(context.app)
      .get('/subscriptions')
      .set(context.authHeaders.admin)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toHaveLength(1);
  });

  it('inspection responses keep safe destination shaping after auth hardening', async () => {
    const event = await context.dataSource.getRepository(EventEntity).save({
      id: randomUUID(),
      eventType: 'order.created',
      producerReference: 'checkout-service',
      correlationId: 'corr-safe-1',
      payload: {
        data: {
          orderId: 'ORD-SAFE-1'
        }
      },
      processingStatus: EventProcessingStatus.COMPLETED,
      acceptedAt: new Date('2026-03-14T08:00:00.000Z'),
      queuedAt: new Date('2026-03-14T08:01:00.000Z'),
      lastProcessedAt: new Date('2026-03-14T08:03:00.000Z'),
      finalizedAt: new Date('2026-03-14T08:03:00.000Z')
    });
    const subscription = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'order.created',
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/orders?token=top-secret',
      status: SubscriptionStatus.ACTIVE
    });
    const delivery = await context.dataSource.getRepository(DeliveryEntity).save({
      id: randomUUID(),
      eventId: event.id,
      subscriptionId: subscription.id,
      channel: NotificationChannel.WEBHOOK,
      target: subscription.target,
      status: DeliveryStatus.SUCCEEDED,
      attemptCount: 1,
      retryCount: 0,
      maxRetryLimit: 3,
      nextRetryAt: null,
      lastErrorSummary: null,
      failureCategory: null,
      completedAt: new Date('2026-03-14T08:03:00.000Z')
    });

    const response = await request(context.app)
      .get(`/deliveries/${delivery.id}`)
      .set(context.authHeaders.admin)
      .expect(200);

    expect(response.body.data.target).toBe('https://example.com/orders');
  });
});
