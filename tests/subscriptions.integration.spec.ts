import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { SubscriptionEntity } from '../src/modules/subscriptions/entities/subscription.entity';
import { SubscriptionStatus } from '../src/types/notification';
import { createTestApp, TestAppContext } from './helpers/test-app';

describe('Sprint 2 subscription management', () => {
  let context: TestAppContext;

  beforeEach(async () => {
    context = await createTestApp();
  });

  afterEach(async () => {
    await context.cleanup();
  });

  it('creates a subscription', async () => {
    const response = await request(context.app)
      .post('/subscriptions')
      .set(context.authHeaders.admin)
      .send({
        eventType: 'order.created',
        channel: 'webhook',
        target: 'https://example.com/webhook'
      })
      .expect(201);

    expect(response.body).toEqual({
      success: true,
      data: {
        subscriptionId: expect.any(String),
        status: 'active'
      }
    });

    const subscription = await context.dataSource
      .getRepository(SubscriptionEntity)
      .findOneByOrFail({ id: response.body.data.subscriptionId });

    expect(subscription.eventType).toBe('order.created');
    expect(subscription.channel).toBe('webhook');
    expect(subscription.target).toBe('https://example.com/webhook');
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
  });

  it('rejects invalid subscription targets', async () => {
    const response = await request(context.app)
      .post('/subscriptions')
      .set(context.authHeaders.admin)
      .send({
        eventType: 'order.created',
        channel: 'email',
        target: 'not-an-email'
      })
      .expect(422);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Target must be a valid email address for the email channel',
        code: 'invalid_subscription_target'
      }
    });

    expect(await context.dataSource.getRepository(SubscriptionEntity).count()).toBe(0);
  });

  it('lists subscriptions with pagination', async () => {
    await request(context.app)
      .post('/subscriptions')
      .set(context.authHeaders.admin)
      .send({
        eventType: 'order.created',
        channel: 'webhook',
        target: 'https://example.com/a'
      })
      .expect(201);

    await request(context.app)
      .post('/subscriptions')
      .set(context.authHeaders.admin)
      .send({
        eventType: 'order.cancelled',
        channel: 'email',
        target: 'ops@example.com'
      })
      .expect(201);

    const response = await request(context.app)
      .get('/subscriptions?page=1&limit=10')
      .set(context.authHeaders.admin)
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.items).toHaveLength(2);
    expect(response.body.data.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 2,
      totalPages: 1
    });
  });

  it('returns a subscription by identifier', async () => {
    const createResponse = await request(context.app)
      .post('/subscriptions')
      .set(context.authHeaders.admin)
      .send({
        eventType: 'invoice.created',
        channel: 'sms',
        target: '+2348012345678'
      })
      .expect(201);

    const response = await request(context.app)
      .get(`/subscriptions/${createResponse.body.data.subscriptionId}`)
      .set(context.authHeaders.admin)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        subscriptionId: createResponse.body.data.subscriptionId,
        eventType: 'invoice.created',
        channel: 'sms',
        target: '+2348012345678',
        status: 'active',
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      }
    });
  });

  it('returns not found for a missing subscription', async () => {
    const response = await request(context.app)
      .get(`/subscriptions/${randomUUID()}`)
      .set(context.authHeaders.admin)
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Subscription not found',
        code: 'subscription_not_found'
      }
    });
  });

  it('updates subscription lifecycle state and target', async () => {
    const createResponse = await request(context.app)
      .post('/subscriptions')
      .set(context.authHeaders.admin)
      .send({
        eventType: 'order.created',
        channel: 'webhook',
        target: 'https://example.com/original'
      })
      .expect(201);

    const response = await request(context.app)
      .patch(`/subscriptions/${createResponse.body.data.subscriptionId}`)
      .set(context.authHeaders.admin)
      .send({
        status: 'inactive',
        target: 'https://example.com/updated'
      })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        subscriptionId: createResponse.body.data.subscriptionId,
        eventType: 'order.created',
        channel: 'webhook',
        target: 'https://example.com/updated',
        status: 'inactive',
        createdAt: expect.any(String),
        updatedAt: expect.any(String)
      }
    });
  });

  it('rejects attempts to update immutable subscription fields', async () => {
    const createResponse = await request(context.app)
      .post('/subscriptions')
      .set(context.authHeaders.admin)
      .send({
        eventType: 'order.created',
        channel: 'webhook',
        target: 'https://example.com/original'
      })
      .expect(201);

    const response = await request(context.app)
      .patch(`/subscriptions/${createResponse.body.data.subscriptionId}`)
      .set(context.authHeaders.admin)
      .send({
        channel: 'email'
      })
      .expect(422);

    expect(response.body).toEqual({
      success: false,
      error: {
        message: 'Request validation failed',
        code: 'validation_error'
      }
    });
  });
});
