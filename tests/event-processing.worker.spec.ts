import { randomUUID } from 'node:crypto';

import { DeliveryAttemptEntity } from '../src/modules/delivery-attempts/entities/delivery-attempt.entity';
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

describe('Sprint 4 event processing worker', () => {
  let context: TestAppContext;

  afterEach(async () => {
    jest.useRealTimers();
    jest.restoreAllMocks();

    if (context) {
      await context.cleanup();
    }
  });

  it('completes events cleanly when no subscriptions match', async () => {
    context = await createTestApp();

    const createdEvent = await context.eventService.createEvent({
      event: 'order.created',
      data: {
        orderId: 'ORD-101'
      }
    });

    const result = await context.processEventJob(createdEvent.eventId);

    expect(result).toEqual({
      eventId: createdEvent.eventId,
      matchedSubscriptions: 0,
      createdDeliveries: 0,
      succeededDeliveries: 0,
      failedDeliveries: 0,
      eventStatus: 'completed'
    });

    const event = await context.dataSource
      .getRepository(EventEntity)
      .findOneByOrFail({ id: createdEvent.eventId });

    expect(event.processingStatus).toBe(EventProcessingStatus.COMPLETED);
    expect(await context.dataSource.getRepository(DeliveryEntity).count()).toBe(0);
    expect(await context.dataSource.getRepository(DeliveryAttemptEntity).count()).toBe(0);
  });

  it('processes successful deliveries and completes the event without scheduling retries', async () => {
    const emailProvider = createProviderDouble(
      NotificationChannel.EMAIL,
      'test-email-provider',
      {
        success: true,
        responseSummary: 'Email accepted',
        errorMessage: null,
        failureCategory: null
      }
    );
    const webhookProvider = createProviderDouble(
      NotificationChannel.WEBHOOK,
      'test-webhook-provider',
      {
        success: true,
        responseSummary: '202 Accepted',
        errorMessage: null,
        failureCategory: null
      }
    );

    context = await createTestApp({
      providerFactory: new ProviderFactory([
        emailProvider.provider,
        webhookProvider.provider
      ])
    });

    const createdEvent = await context.eventService.createEvent({
      event: 'order.created',
      data: {
        orderId: 'ORD-202'
      }
    });

    const activeWebhook = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'order.created',
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/webhook',
      status: SubscriptionStatus.ACTIVE
    });
    const activeEmail = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'order.created',
      channel: NotificationChannel.EMAIL,
      target: 'ops@example.com',
      status: SubscriptionStatus.ACTIVE
    });

    const result = await context.processEventJob(createdEvent.eventId);

    expect(result).toEqual({
      eventId: createdEvent.eventId,
      matchedSubscriptions: 2,
      createdDeliveries: 2,
      succeededDeliveries: 2,
      failedDeliveries: 0,
      eventStatus: 'completed'
    });

    const deliveries = await context.dataSource.getRepository(DeliveryEntity).find({
      where: { eventId: createdEvent.eventId },
      order: { channel: 'ASC' }
    });

    expect(deliveries).toEqual([
      expect.objectContaining({
        subscriptionId: activeEmail.id,
        channel: NotificationChannel.EMAIL,
        target: 'ops@example.com',
        status: DeliveryStatus.SUCCEEDED,
        attemptCount: 1,
        retryCount: 0,
        nextRetryAt: null
      }),
      expect.objectContaining({
        subscriptionId: activeWebhook.id,
        channel: NotificationChannel.WEBHOOK,
        target: 'https://example.com/webhook',
        status: DeliveryStatus.SUCCEEDED,
        attemptCount: 1,
        retryCount: 0,
        nextRetryAt: null
      })
    ]);

    expect(context.enqueueDeliveryRetry).not.toHaveBeenCalled();
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
    expect(webhookProvider.send).toHaveBeenCalledTimes(1);
  });

  it('schedules delayed retry for retryable failures and keeps the event processing', async () => {
    const webhookProvider = createProviderDouble(
      NotificationChannel.WEBHOOK,
      'test-webhook-provider',
      {
        success: false,
        responseSummary: '500 Internal Server Error',
        errorMessage: 'Webhook delivery failed with status 500',
        failureCategory: 'provider_http_error'
      }
    );

    context = await createTestApp({
      providerFactory: new ProviderFactory([webhookProvider.provider]),
      retryBaseDelayMs: 2000
    });

    const createdEvent = await context.eventService.createEvent({
      event: 'payment.received',
      data: {
        paymentId: 'PAY-303'
      }
    });

    const subscription = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'payment.received',
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/payments',
      status: SubscriptionStatus.ACTIVE
    });

    const before = Date.now();
    const result = await context.processEventJob(createdEvent.eventId);
    const after = Date.now();

    expect(result).toEqual({
      eventId: createdEvent.eventId,
      matchedSubscriptions: 1,
      createdDeliveries: 1,
      succeededDeliveries: 0,
      failedDeliveries: 0,
      eventStatus: 'processing'
    });

    const delivery = await context.dataSource
      .getRepository(DeliveryEntity)
      .findOneByOrFail({
        eventId: createdEvent.eventId,
        subscriptionId: subscription.id
      });

    expect(delivery).toEqual(
      expect.objectContaining({
        status: DeliveryStatus.RETRYING,
        attemptCount: 1,
        retryCount: 1,
        failureCategory: 'provider_temporary_failure',
        lastErrorSummary: 'Webhook delivery failed with status 500'
      })
    );
    expect(delivery.nextRetryAt).toBeInstanceOf(Date);
    expect(delivery.nextRetryAt!.getTime()).toBeGreaterThanOrEqual(before + 2000);
    expect(delivery.nextRetryAt!.getTime()).toBeLessThanOrEqual(after + 2000);

    expect(context.enqueueDeliveryRetry).toHaveBeenCalledTimes(1);
    expect(context.enqueueDeliveryRetry).toHaveBeenCalledWith(
      {
        deliveryId: delivery.id,
        eventId: createdEvent.eventId,
        scheduledRetryCount: 1,
        correlationId: expect.any(String)
      },
      2000
    );

    const attempts = await context.deliveryAttemptRepository.findByDeliveryId(delivery.id);

    expect(attempts).toEqual([
      expect.objectContaining({
        attemptSequence: 1,
        outcome: DeliveryAttemptOutcome.FAILURE,
        failureCategory: 'provider_temporary_failure',
        errorMessage: 'Webhook delivery failed with status 500'
      })
    ]);

    const event = await context.dataSource
      .getRepository(EventEntity)
      .findOneByOrFail({ id: createdEvent.eventId });

    expect(event.processingStatus).toBe(EventProcessingStatus.PROCESSING);
    expect(event.finalizedAt).toBeNull();
  });

  it('fails terminally for non-retryable failures without scheduling a retry', async () => {
    const webhookProvider = createProviderDouble(
      NotificationChannel.WEBHOOK,
      'test-webhook-provider',
      {
        success: false,
        responseSummary: '404 Not Found',
        errorMessage: 'Webhook target not found',
        failureCategory: 'invalid_destination'
      }
    );

    context = await createTestApp({
      providerFactory: new ProviderFactory([webhookProvider.provider])
    });

    const createdEvent = await context.eventService.createEvent({
      event: 'invoice.created',
      data: {
        invoiceId: 'INV-404'
      }
    });

    const subscription = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'invoice.created',
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/missing',
      status: SubscriptionStatus.ACTIVE
    });

    const result = await context.processEventJob(createdEvent.eventId);

    expect(result).toEqual({
      eventId: createdEvent.eventId,
      matchedSubscriptions: 1,
      createdDeliveries: 1,
      succeededDeliveries: 0,
      failedDeliveries: 1,
      eventStatus: 'failed'
    });

    const delivery = await context.dataSource
      .getRepository(DeliveryEntity)
      .findOneByOrFail({
        eventId: createdEvent.eventId,
        subscriptionId: subscription.id
      });

    expect(delivery).toEqual(
      expect.objectContaining({
        status: DeliveryStatus.FAILED,
        attemptCount: 1,
        retryCount: 0,
        nextRetryAt: null,
        failureCategory: 'invalid_destination',
        lastErrorSummary: 'Webhook target not found'
      })
    );

    expect(context.enqueueDeliveryRetry).not.toHaveBeenCalled();

    const event = await context.dataSource
      .getRepository(EventEntity)
      .findOneByOrFail({ id: createdEvent.eventId });

    expect(event.processingStatus).toBe(EventProcessingStatus.FAILED);
    expect(event.finalizedAt).toBeInstanceOf(Date);
  });

  it('running the same event-processing job twice does not create duplicate deliveries or resend succeeded deliveries', async () => {
    const emailProvider = createProviderDouble(
      NotificationChannel.EMAIL,
      'test-email-provider',
      {
        success: true,
        responseSummary: 'Email accepted',
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
        orderId: 'ORD-REUSE-1'
      }
    });

    const subscription = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'order.created',
      channel: NotificationChannel.EMAIL,
      target: 'ops@example.com',
      status: SubscriptionStatus.ACTIVE
    });

    const firstRun = await context.processEventJob(createdEvent.eventId);
    const secondRun = await context.processEventJob(createdEvent.eventId);

    expect(firstRun.eventStatus).toBe('completed');
    expect(secondRun).toEqual({
      eventId: createdEvent.eventId,
      matchedSubscriptions: 1,
      createdDeliveries: 0,
      succeededDeliveries: 1,
      failedDeliveries: 0,
      eventStatus: 'completed'
    });

    const deliveries = await context.dataSource.getRepository(DeliveryEntity).find({
      where: {
        eventId: createdEvent.eventId,
        subscriptionId: subscription.id
      }
    });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toEqual(
      expect.objectContaining({
        status: DeliveryStatus.SUCCEEDED,
        attemptCount: 1,
        retryCount: 0
      })
    );
    expect(emailProvider.send).toHaveBeenCalledTimes(1);

    const attempts = await context.deliveryAttemptRepository.findByDeliveryId(
      deliveries[0].id
    );

    expect(attempts).toHaveLength(1);
  });

  it('running the same event-processing job twice does not resend retrying deliveries or create extra attempts', async () => {
    const webhookProvider = createProviderDouble(
      NotificationChannel.WEBHOOK,
      'test-webhook-provider',
      {
        success: false,
        responseSummary: '500 Internal Server Error',
        errorMessage: 'Temporary outage',
        failureCategory: 'provider_http_error'
      }
    );

    context = await createTestApp({
      providerFactory: new ProviderFactory([webhookProvider.provider]),
      retryBaseDelayMs: 1500
    });

    const createdEvent = await context.eventService.createEvent({
      event: 'payment.received',
      data: {
        paymentId: 'PAY-REUSE-2'
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
    const secondRun = await context.processEventJob(createdEvent.eventId);

    expect(firstRun.eventStatus).toBe('processing');
    expect(secondRun).toEqual({
      eventId: createdEvent.eventId,
      matchedSubscriptions: 1,
      createdDeliveries: 0,
      succeededDeliveries: 0,
      failedDeliveries: 0,
      eventStatus: 'processing'
    });

    const delivery = await context.dataSource
      .getRepository(DeliveryEntity)
      .findOneByOrFail({
        eventId: createdEvent.eventId,
        subscriptionId: subscription.id
      });

    expect(delivery.status).toBe(DeliveryStatus.RETRYING);
    expect(delivery.attemptCount).toBe(1);
    expect(delivery.retryCount).toBe(1);
    expect(webhookProvider.send).toHaveBeenCalledTimes(1);
    expect(context.enqueueDeliveryRetry).toHaveBeenCalledTimes(1);

    const attempts = await context.deliveryAttemptRepository.findByDeliveryId(delivery.id);

    expect(attempts).toHaveLength(1);
  });

  it('enforces delivery uniqueness on eventId and subscriptionId', async () => {
    context = await createTestApp();

    const createdEvent = await context.eventService.createEvent({
      event: 'invoice.created',
      data: {
        invoiceId: 'INV-UNIQUE-1'
      }
    });

    const subscription = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'invoice.created',
      channel: NotificationChannel.EMAIL,
      target: 'billing@example.com',
      status: SubscriptionStatus.ACTIVE
    });

    await context.dataSource.getRepository(DeliveryEntity).save({
      id: randomUUID(),
      eventId: createdEvent.eventId,
      subscriptionId: subscription.id,
      channel: NotificationChannel.EMAIL,
      target: 'billing@example.com',
      status: DeliveryStatus.PENDING,
      attemptCount: 0,
      retryCount: 0,
      maxRetryLimit: 3,
      nextRetryAt: null,
      lastErrorSummary: null,
      failureCategory: null
    });

    await expect(
      context.dataSource.getRepository(DeliveryEntity).save({
        id: randomUUID(),
        eventId: createdEvent.eventId,
        subscriptionId: subscription.id,
        channel: NotificationChannel.EMAIL,
        target: 'billing@example.com',
        status: DeliveryStatus.PENDING,
        attemptCount: 0,
        retryCount: 0,
        maxRetryLimit: 3,
        nextRetryAt: null,
        lastErrorSummary: null,
        failureCategory: null
      })
    ).rejects.toThrow();
  });

  it('enforces delivery-attempt uniqueness on deliveryId and attemptSequence', async () => {
    context = await createTestApp();

    const createdEvent = await context.eventService.createEvent({
      event: 'invoice.created',
      data: {
        invoiceId: 'INV-ATTEMPT-1'
      }
    });

    const subscription = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'invoice.created',
      channel: NotificationChannel.EMAIL,
      target: 'billing@example.com',
      status: SubscriptionStatus.ACTIVE
    });

    const delivery = await context.dataSource.getRepository(DeliveryEntity).save({
      id: randomUUID(),
      eventId: createdEvent.eventId,
      subscriptionId: subscription.id,
      channel: NotificationChannel.EMAIL,
      target: 'billing@example.com',
      status: DeliveryStatus.PENDING,
      attemptCount: 0,
      retryCount: 0,
      maxRetryLimit: 3,
      nextRetryAt: null,
      lastErrorSummary: null,
      failureCategory: null
    });

    await context.dataSource.getRepository(DeliveryAttemptEntity).save({
      id: randomUUID(),
      deliveryId: delivery.id,
      attemptSequence: 1,
      channel: NotificationChannel.EMAIL,
      providerName: 'test-email-provider',
      outcome: DeliveryAttemptOutcome.SUCCESS,
      failureCategory: null,
      errorMessage: null,
      providerResponseSummary: 'Accepted',
      attemptedAt: new Date()
    });

    await expect(
      context.dataSource.getRepository(DeliveryAttemptEntity).save({
        id: randomUUID(),
        deliveryId: delivery.id,
        attemptSequence: 1,
        channel: NotificationChannel.EMAIL,
        providerName: 'test-email-provider',
        outcome: DeliveryAttemptOutcome.SUCCESS,
        failureCategory: null,
        errorMessage: null,
        providerResponseSummary: 'Accepted',
        attemptedAt: new Date()
      })
    ).rejects.toThrow();
  });

  it('allocates attemptSequence from durable history rather than only from attemptCount', async () => {
    context = await createTestApp();

    const createdEvent = await context.eventService.createEvent({
      event: 'invoice.created',
      data: {
        invoiceId: 'INV-SEQ-1'
      }
    });

    const subscription = await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'invoice.created',
      channel: NotificationChannel.EMAIL,
      target: 'billing@example.com',
      status: SubscriptionStatus.ACTIVE
    });

    const delivery = await context.dataSource.getRepository(DeliveryEntity).save({
      id: randomUUID(),
      eventId: createdEvent.eventId,
      subscriptionId: subscription.id,
      channel: NotificationChannel.EMAIL,
      target: 'billing@example.com',
      status: DeliveryStatus.PENDING,
      attemptCount: 0,
      retryCount: 0,
      maxRetryLimit: 3,
      nextRetryAt: null,
      lastErrorSummary: null,
      failureCategory: null
    });

    const firstAttempt = await context.deliveryAttemptRepository.createNextAttempt({
      id: randomUUID(),
      deliveryId: delivery.id,
      channel: NotificationChannel.EMAIL,
      providerName: 'test-email-provider',
      outcome: DeliveryAttemptOutcome.SUCCESS,
      failureCategory: null,
      errorMessage: null,
      providerResponseSummary: 'Accepted',
      attemptedAt: new Date()
    });

    expect(firstAttempt.attemptSequence).toBe(1);

    const secondAttempt = await context.deliveryAttemptRepository.createNextAttempt({
      id: randomUUID(),
      deliveryId: delivery.id,
      channel: NotificationChannel.EMAIL,
      providerName: 'test-email-provider',
      outcome: DeliveryAttemptOutcome.FAILURE,
      failureCategory: 'provider_http_error',
      errorMessage: 'Second attempt failed',
      providerResponseSummary: '500 Internal Server Error',
      attemptedAt: new Date()
    });

    expect(secondAttempt.attemptSequence).toBe(2);
  });
});
