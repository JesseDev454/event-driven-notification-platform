import { randomUUID } from 'node:crypto';

import { DeliveryEntity } from '../src/modules/deliveries/entities/delivery.entity';
import {
  EventEntity,
  EventProcessingStatus
} from '../src/modules/events/entities/event.entity';
import { NotificationProvider } from '../src/providers/interfaces/notification-provider.interface';
import { ProviderFactory } from '../src/providers/provider.factory';
import { SubscriptionEntity } from '../src/modules/subscriptions/entities/subscription.entity';
import {
  DeliveryAttemptOutcome,
  DeliveryStatus,
  NotificationChannel,
  SubscriptionStatus
} from '../src/types/notification';
import { createTestApp, TestAppContext } from './helpers/test-app';

type ProviderResultDouble = {
  success: boolean;
  responseSummary: string | null;
  errorMessage: string | null;
  failureCategory: string | null;
};

const createProviderDouble = (
  channel: NotificationChannel,
  providerName: string,
  results: ProviderResultDouble | ProviderResultDouble[]
): { provider: NotificationProvider; send: jest.Mock } => {
  const plannedResults = Array.isArray(results) ? results : [results];
  const send = jest.fn();

  for (const result of plannedResults) {
    send.mockResolvedValueOnce({
      providerName,
      ...result
    });
  }

  send.mockResolvedValue({
    providerName,
    ...plannedResults[plannedResults.length - 1]
  });

  return {
    provider: {
      channel,
      providerName,
      send
    },
    send
  };
};

describe('Sprint 4 delivery retry worker', () => {
  let context: TestAppContext;

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();

    if (context) {
      await context.cleanup();
    }
  });

  it('successful retry transitions delivery to succeeded and completes the event', async () => {
    const webhookProvider = createProviderDouble(
      NotificationChannel.WEBHOOK,
      'test-webhook-provider',
      [
        {
          success: false,
          responseSummary: '500 Internal Server Error',
          errorMessage: 'Temporary outage',
          failureCategory: 'provider_http_error'
        },
        {
          success: true,
          responseSummary: '202 Accepted',
          errorMessage: null,
          failureCategory: null
        }
      ]
    );

    context = await createTestApp({
      providerFactory: new ProviderFactory([webhookProvider.provider]),
      retryBaseDelayMs: 3000
    });

    const createdEvent = await context.eventService.createEvent({
      event: 'payment.received',
      data: {
        paymentId: 'PAY-RETRY-1'
      }
    });

    const subscription = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'payment.received',
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/payments',
      status: SubscriptionStatus.ACTIVE
    });

    const firstRun = await context.processEventJob(createdEvent.eventId);

    expect(firstRun.eventStatus).toBe('processing');

    const delivery = await context.dataSource
      .getRepository(DeliveryEntity)
      .findOneByOrFail({
        eventId: createdEvent.eventId,
        subscriptionId: subscription.id
      });

    const retryResult = await context.processRetryJob(
      delivery.id,
      createdEvent.eventId,
      1
    );

    expect(retryResult).toEqual({
      deliveryId: delivery.id,
      eventId: createdEvent.eventId,
      attempted: true,
      deliveryStatus: DeliveryStatus.SUCCEEDED,
      eventStatus: 'completed'
    });

    const reloadedDelivery = await context.dataSource
      .getRepository(DeliveryEntity)
      .findOneByOrFail({ id: delivery.id });

    expect(reloadedDelivery).toEqual(
      expect.objectContaining({
        status: DeliveryStatus.SUCCEEDED,
        attemptCount: 2,
        retryCount: 1,
        nextRetryAt: null,
        failureCategory: null,
        lastErrorSummary: null
      })
    );

    const attempts = await context.deliveryAttemptRepository.findByDeliveryId(delivery.id);

    expect(attempts).toHaveLength(2);
    expect(attempts.map((attempt) => attempt.outcome)).toEqual([
      DeliveryAttemptOutcome.FAILURE,
      DeliveryAttemptOutcome.SUCCESS
    ]);

    const event = await context.dataSource
      .getRepository(EventEntity)
      .findOneByOrFail({ id: createdEvent.eventId });

    expect(event.processingStatus).toBe(EventProcessingStatus.COMPLETED);
    expect(context.enqueueDeliveryRetry).toHaveBeenCalledTimes(1);
    expect(webhookProvider.send).toHaveBeenCalledTimes(2);
  });

  it('retryable failure during retry schedules another delayed retry and keeps the event processing', async () => {
    const webhookProvider = createProviderDouble(
      NotificationChannel.WEBHOOK,
      'test-webhook-provider',
      [
        {
          success: false,
          responseSummary: '500 Internal Server Error',
          errorMessage: 'Initial outage',
          failureCategory: 'provider_http_error'
        },
        {
          success: false,
          responseSummary: '502 Bad Gateway',
          errorMessage: 'Still unavailable',
          failureCategory: 'network_error'
        }
      ]
    );

    context = await createTestApp({
      providerFactory: new ProviderFactory([webhookProvider.provider]),
      defaultMaxRetryLimit: 3,
      retryBaseDelayMs: 1000
    });

    const createdEvent = await context.eventService.createEvent({
      event: 'payment.received',
      data: {
        paymentId: 'PAY-RETRY-2'
      }
    });

    const subscription = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'payment.received',
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/payments',
      status: SubscriptionStatus.ACTIVE
    });

    await context.processEventJob(createdEvent.eventId);

    const delivery = await context.dataSource
      .getRepository(DeliveryEntity)
      .findOneByOrFail({
        eventId: createdEvent.eventId,
        subscriptionId: subscription.id
      });

    const beforeRetry = Date.now();
    const retryResult = await context.processRetryJob(
      delivery.id,
      createdEvent.eventId,
      1
    );
    const afterRetry = Date.now();

    expect(retryResult).toEqual({
      deliveryId: delivery.id,
      eventId: createdEvent.eventId,
      attempted: true,
      deliveryStatus: DeliveryStatus.RETRYING,
      eventStatus: 'processing'
    });

    const reloadedDelivery = await context.dataSource
      .getRepository(DeliveryEntity)
      .findOneByOrFail({ id: delivery.id });

    expect(reloadedDelivery).toEqual(
      expect.objectContaining({
        status: DeliveryStatus.RETRYING,
        attemptCount: 2,
        retryCount: 2,
        failureCategory: 'network_error',
        lastErrorSummary: 'Still unavailable'
      })
    );
    expect(reloadedDelivery.nextRetryAt).toBeInstanceOf(Date);
    expect(reloadedDelivery.nextRetryAt!.getTime()).toBeGreaterThanOrEqual(
      beforeRetry + 2000
    );
    expect(reloadedDelivery.nextRetryAt!.getTime()).toBeLessThanOrEqual(
      afterRetry + 2000
    );

    expect(context.enqueueDeliveryRetry).toHaveBeenCalledTimes(2);
    expect(context.enqueueDeliveryRetry).toHaveBeenLastCalledWith(
      {
        deliveryId: delivery.id,
        eventId: createdEvent.eventId,
        scheduledRetryCount: 2,
        correlationId: expect.any(String)
      },
      2000
    );

    const event = await context.dataSource
      .getRepository(EventEntity)
      .findOneByOrFail({ id: createdEvent.eventId });

    expect(event.processingStatus).toBe(EventProcessingStatus.PROCESSING);
  });

  it('marks delivery failed after retry exhaustion and fails the event', async () => {
    const webhookProvider = createProviderDouble(
      NotificationChannel.WEBHOOK,
      'test-webhook-provider',
      [
        {
          success: false,
          responseSummary: '500 Internal Server Error',
          errorMessage: 'Initial outage',
          failureCategory: 'provider_http_error'
        },
        {
          success: false,
          responseSummary: '503 Service Unavailable',
          errorMessage: 'Retry exhausted',
          failureCategory: 'network_error'
        }
      ]
    );

    context = await createTestApp({
      providerFactory: new ProviderFactory([webhookProvider.provider]),
      defaultMaxRetryLimit: 1,
      retryBaseDelayMs: 1000
    });

    const createdEvent = await context.eventService.createEvent({
      event: 'payment.received',
      data: {
        paymentId: 'PAY-RETRY-3'
      }
    });

    const subscription = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'payment.received',
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/payments',
      status: SubscriptionStatus.ACTIVE
    });

    await context.processEventJob(createdEvent.eventId);

    const delivery = await context.dataSource
      .getRepository(DeliveryEntity)
      .findOneByOrFail({
        eventId: createdEvent.eventId,
        subscriptionId: subscription.id
      });

    const retryResult = await context.processRetryJob(
      delivery.id,
      createdEvent.eventId,
      1
    );

    expect(retryResult).toEqual({
      deliveryId: delivery.id,
      eventId: createdEvent.eventId,
      attempted: true,
      deliveryStatus: DeliveryStatus.FAILED,
      eventStatus: 'failed'
    });

    const reloadedDelivery = await context.dataSource
      .getRepository(DeliveryEntity)
      .findOneByOrFail({ id: delivery.id });

    expect(reloadedDelivery).toEqual(
      expect.objectContaining({
        status: DeliveryStatus.FAILED,
        attemptCount: 2,
        retryCount: 1,
        nextRetryAt: null,
        failureCategory: 'network_error',
        lastErrorSummary: 'Retry exhausted'
      })
    );

    expect(context.enqueueDeliveryRetry).toHaveBeenCalledTimes(1);

    const event = await context.dataSource
      .getRepository(EventEntity)
      .findOneByOrFail({ id: createdEvent.eventId });

    expect(event.processingStatus).toBe(EventProcessingStatus.FAILED);
    expect(event.finalizedAt).toBeInstanceOf(Date);
  });

  it('does not resend already-succeeded deliveries in the retry worker', async () => {
    const emailProvider = createProviderDouble(
      NotificationChannel.EMAIL,
      'test-email-provider',
      {
        success: true,
        responseSummary: 'Accepted',
        errorMessage: null,
        failureCategory: null
      }
    );

    context = await createTestApp({
      providerFactory: new ProviderFactory([emailProvider.provider])
    });

    const createdEvent = await context.eventService.createEvent({
      event: 'order.created',
      data: {
        orderId: 'ORD-RETRY-4'
      }
    });

    const subscription = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'order.created',
      channel: NotificationChannel.EMAIL,
      target: 'ops@example.com',
      status: SubscriptionStatus.ACTIVE
    });

    await context.processEventJob(createdEvent.eventId);

    const delivery = await context.dataSource
      .getRepository(DeliveryEntity)
      .findOneByOrFail({
        eventId: createdEvent.eventId,
        subscriptionId: subscription.id
      });

    const retryResult = await context.processRetryJob(
      delivery.id,
      createdEvent.eventId,
      1
    );

    expect(retryResult).toEqual({
      deliveryId: delivery.id,
      eventId: createdEvent.eventId,
      attempted: false,
      deliveryStatus: DeliveryStatus.SUCCEEDED,
      eventStatus: 'completed'
    });

    expect(emailProvider.send).toHaveBeenCalledTimes(1);

    const attempts = await context.deliveryAttemptRepository.findByDeliveryId(delivery.id);

    expect(attempts).toHaveLength(1);
  });

  it('does not retry terminally failed deliveries', async () => {
    const webhookProvider = createProviderDouble(
      NotificationChannel.WEBHOOK,
      'test-webhook-provider',
      {
        success: false,
        responseSummary: '404 Not Found',
        errorMessage: 'Missing endpoint',
        failureCategory: 'invalid_destination'
      }
    );

    context = await createTestApp({
      providerFactory: new ProviderFactory([webhookProvider.provider])
    });

    const createdEvent = await context.eventService.createEvent({
      event: 'invoice.created',
      data: {
        invoiceId: 'INV-RETRY-5'
      }
    });

    const subscription = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'invoice.created',
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/missing',
      status: SubscriptionStatus.ACTIVE
    });

    await context.processEventJob(createdEvent.eventId);

    const delivery = await context.dataSource
      .getRepository(DeliveryEntity)
      .findOneByOrFail({
        eventId: createdEvent.eventId,
        subscriptionId: subscription.id
      });

    const retryResult = await context.processRetryJob(
      delivery.id,
      createdEvent.eventId,
      1
    );

    expect(retryResult).toEqual({
      deliveryId: delivery.id,
      eventId: createdEvent.eventId,
      attempted: false,
      deliveryStatus: DeliveryStatus.FAILED,
      eventStatus: 'failed'
    });

    expect(webhookProvider.send).toHaveBeenCalledTimes(1);

    const attempts = await context.deliveryAttemptRepository.findByDeliveryId(delivery.id);

    expect(attempts).toHaveLength(1);
  });
});
