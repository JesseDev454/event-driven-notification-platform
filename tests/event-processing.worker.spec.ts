import { randomUUID } from 'node:crypto';

import { DeliveryAttemptEntity } from '../src/modules/delivery-attempts/entities/delivery-attempt.entity';
import { DeliveryEntity } from '../src/modules/deliveries/entities/delivery.entity';
import { EventEntity, EventProcessingStatus } from '../src/modules/events/entities/event.entity';
import { ProviderFactory } from '../src/providers/provider.factory';
import { NotificationProvider } from '../src/providers/interfaces/notification-provider.interface';
import { SubscriptionEntity } from '../src/modules/subscriptions/entities/subscription.entity';
import {
  DeliveryAttemptOutcome,
  DeliveryStatus,
  NotificationChannel,
  SubscriptionStatus
} from '../src/types/notification';
import { createTestApp, TestAppContext } from './helpers/test-app';

const createProviderDouble = (
  channel: NotificationChannel,
  providerName: string,
  result: {
    success: boolean;
    responseSummary: string | null;
    errorMessage: string | null;
    failureCategory: string | null;
  }
): { provider: NotificationProvider; send: jest.Mock } => {
  const send = jest.fn().mockResolvedValue({
    providerName,
    ...result
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

describe('Sprint 3 event processing worker', () => {
  let context: TestAppContext;

  afterEach(async () => {
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
    expect(event.finalizedAt).toBeInstanceOf(Date);
    expect(await context.dataSource.getRepository(DeliveryEntity).count()).toBe(0);
    expect(await context.dataSource.getRepository(DeliveryAttemptEntity).count()).toBe(0);
  });

  it('processes successful deliveries, creates attempts, and completes the event', async () => {
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
    const smsProvider = createProviderDouble(
      NotificationChannel.SMS,
      'test-sms-provider',
      {
        success: true,
        responseSummary: 'SMS queued',
        errorMessage: null,
        failureCategory: null
      }
    );

    context = await createTestApp({
      providerFactory: new ProviderFactory([
        emailProvider.provider,
        webhookProvider.provider,
        smsProvider.provider
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
    await context.dataSource.getRepository(SubscriptionEntity).save({
      id: randomUUID(),
      eventType: 'order.created',
      channel: NotificationChannel.SMS,
      target: '+2348012345678',
      status: SubscriptionStatus.INACTIVE
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

    expect(deliveries).toHaveLength(2);
    expect(deliveries).toEqual([
      expect.objectContaining({
        eventId: createdEvent.eventId,
        subscriptionId: activeEmail.id,
        channel: NotificationChannel.EMAIL,
        target: 'ops@example.com',
        status: DeliveryStatus.SUCCEEDED,
        attemptCount: 1
      }),
      expect.objectContaining({
        eventId: createdEvent.eventId,
        subscriptionId: activeWebhook.id,
        channel: NotificationChannel.WEBHOOK,
        target: 'https://example.com/webhook',
        status: DeliveryStatus.SUCCEEDED,
        attemptCount: 1
      })
    ]);

    const emailAttempts = await context.deliveryAttemptRepository.findByDeliveryId(
      deliveries[0].id
    );
    const webhookAttempts = await context.deliveryAttemptRepository.findByDeliveryId(
      deliveries[1].id
    );

    expect(emailAttempts).toEqual([
      expect.objectContaining({
        deliveryId: deliveries[0].id,
        attemptSequence: 1,
        channel: NotificationChannel.EMAIL,
        providerName: 'test-email-provider',
        outcome: DeliveryAttemptOutcome.SUCCESS,
        failureCategory: null,
        errorMessage: null,
        providerResponseSummary: 'Email accepted'
      })
    ]);
    expect(webhookAttempts).toEqual([
      expect.objectContaining({
        deliveryId: deliveries[1].id,
        attemptSequence: 1,
        channel: NotificationChannel.WEBHOOK,
        providerName: 'test-webhook-provider',
        outcome: DeliveryAttemptOutcome.SUCCESS,
        failureCategory: null,
        errorMessage: null,
        providerResponseSummary: '202 Accepted'
      })
    ]);

    const event = await context.dataSource
      .getRepository(EventEntity)
      .findOneByOrFail({ id: createdEvent.eventId });

    expect(event.processingStatus).toBe(EventProcessingStatus.COMPLETED);
    expect(event.lastProcessedAt).toBeInstanceOf(Date);
    expect(event.finalizedAt).toBeInstanceOf(Date);
    expect(emailProvider.send).toHaveBeenCalledTimes(1);
    expect(webhookProvider.send).toHaveBeenCalledTimes(1);
  });

  it('records failed attempts, increments attempt counts, and fails the event when any delivery fails', async () => {
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
        success: false,
        responseSummary: '500 Internal Server Error',
        errorMessage: 'Webhook delivery failed with status 500',
        failureCategory: 'provider_http_error'
      }
    );
    const smsProvider = createProviderDouble(
      NotificationChannel.SMS,
      'test-sms-provider',
      {
        success: true,
        responseSummary: 'SMS queued',
        errorMessage: null,
        failureCategory: null
      }
    );

    context = await createTestApp({
      providerFactory: new ProviderFactory([
        emailProvider.provider,
        webhookProvider.provider,
        smsProvider.provider
      ])
    });

    const createdEvent = await context.eventService.createEvent({
      event: 'payment.received',
      data: {
        paymentId: 'PAY-303'
      }
    });

    await context.subscriptionService.createSubscription({
      eventType: 'payment.received',
      channel: NotificationChannel.EMAIL,
      target: 'finance@example.com'
    });
    await context.subscriptionService.createSubscription({
      eventType: 'payment.received',
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/payments'
    });
    await context.subscriptionService.createSubscription({
      eventType: 'payment.received',
      channel: NotificationChannel.SMS,
      target: '+2348099999999'
    });

    const markProcessingSpy = jest.spyOn(context.deliveryService, 'markProcessing');
    const markSucceededSpy = jest.spyOn(context.deliveryService, 'markSucceeded');
    const markFailedSpy = jest.spyOn(context.deliveryService, 'markFailed');

    const result = await context.processEventJob(createdEvent.eventId);

    expect(result).toEqual({
      eventId: createdEvent.eventId,
      matchedSubscriptions: 3,
      createdDeliveries: 3,
      succeededDeliveries: 2,
      failedDeliveries: 1,
      eventStatus: 'failed'
    });

    const deliveries = await context.deliveryService.getDeliveriesForEvent(
      createdEvent.eventId
    );

    expect(deliveries).toHaveLength(3);
    expect(
      deliveries.map((delivery) => ({
        channel: delivery.channel,
        status: delivery.status,
        attemptCount: delivery.attemptCount
      }))
    ).toEqual([
      {
        channel: NotificationChannel.EMAIL,
        status: DeliveryStatus.SUCCEEDED,
        attemptCount: 1
      },
      {
        channel: NotificationChannel.WEBHOOK,
        status: DeliveryStatus.FAILED,
        attemptCount: 1
      },
      {
        channel: NotificationChannel.SMS,
        status: DeliveryStatus.SUCCEEDED,
        attemptCount: 1
      }
    ]);

    const attempts = await context.dataSource.getRepository(DeliveryAttemptEntity).find({
      order: { attemptedAt: 'ASC' }
    });

    expect(attempts).toHaveLength(3);
    expect(attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: NotificationChannel.EMAIL,
          providerName: 'test-email-provider',
          outcome: DeliveryAttemptOutcome.SUCCESS
        }),
        expect.objectContaining({
          channel: NotificationChannel.WEBHOOK,
          providerName: 'test-webhook-provider',
          outcome: DeliveryAttemptOutcome.FAILURE,
          failureCategory: 'provider_http_error',
          errorMessage: 'Webhook delivery failed with status 500',
          providerResponseSummary: '500 Internal Server Error'
        }),
        expect.objectContaining({
          channel: NotificationChannel.SMS,
          providerName: 'test-sms-provider',
          outcome: DeliveryAttemptOutcome.SUCCESS
        })
      ])
    );

    const event = await context.dataSource
      .getRepository(EventEntity)
      .findOneByOrFail({ id: createdEvent.eventId });

    expect(event.processingStatus).toBe(EventProcessingStatus.FAILED);
    expect(event.finalizedAt).toBeInstanceOf(Date);
    expect(markProcessingSpy).toHaveBeenCalledTimes(3);
    expect(markSucceededSpy).toHaveBeenCalledTimes(2);
    expect(markFailedSpy).toHaveBeenCalledTimes(1);
    expect(markProcessingSpy.mock.invocationCallOrder[0]).toBeLessThan(
      markSucceededSpy.mock.invocationCallOrder[0]
    );
    expect(markProcessingSpy.mock.invocationCallOrder[1]).toBeLessThan(
      markFailedSpy.mock.invocationCallOrder[0]
    );
  });
});
