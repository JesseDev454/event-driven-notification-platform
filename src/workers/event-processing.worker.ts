import { randomUUID } from 'node:crypto';

import { Job, Worker } from 'bullmq';

import {
  EVENT_PROCESSING_QUEUE_NAME,
  EventProcessingJobPayload
} from '../config/bullmq';
import { initializeDatabase } from '../config/database';
import { loadEnv } from '../config/env';
import { createRedisOptions } from '../config/redis';
import { DeliveryAttemptRepository } from '../modules/delivery-attempts/repositories/delivery-attempt.repository';
import { DeliveryAttemptEntity } from '../modules/delivery-attempts/entities/delivery-attempt.entity';
import { DeliveryEntity } from '../modules/deliveries/entities/delivery.entity';
import { DeliveryRepository } from '../modules/deliveries/repositories/delivery.repository';
import { DeliveryService } from '../modules/deliveries/services/delivery.service';
import { EventEntity } from '../modules/events/entities/event.entity';
import { EventRepository } from '../modules/events/repositories/event.repository';
import { EventService } from '../modules/events/services/event.service';
import { SubscriptionEntity } from '../modules/subscriptions/entities/subscription.entity';
import { SubscriptionRepository } from '../modules/subscriptions/repositories/subscription.repository';
import { SubscriptionService } from '../modules/subscriptions/services/subscription.service';
import {
  NotificationProviderFactory,
  createDefaultProviderFactory
} from '../providers/provider.factory';
import {
  NotificationProvider,
  NotificationProviderResult,
  NotificationSendInput
} from '../providers/interfaces/notification-provider.interface';
import {
  DeliveryAttemptOutcome
} from '../types/notification';

export interface EventProcessingWorkerDependencies {
  eventService: EventService;
  subscriptionService: SubscriptionService;
  deliveryService: DeliveryService;
  deliveryAttemptRepository: DeliveryAttemptRepository;
  providerFactory: NotificationProviderFactory;
}

export interface EventProcessingResult {
  eventId: string;
  matchedSubscriptions: number;
  createdDeliveries: number;
  succeededDeliveries: number;
  failedDeliveries: number;
  eventStatus: 'completed' | 'failed';
}

const buildProviderInput = (
  delivery: DeliveryEntity,
  event: EventEntity
): NotificationSendInput => ({
  deliveryId: delivery.id,
  eventId: event.id,
  eventType: event.eventType,
  payload: event.payload,
  channel: delivery.channel,
  target: delivery.target,
  correlationId: event.correlationId
});

const normalizeThrownProviderError = (
  provider: NotificationProvider,
  error: unknown
): NotificationProviderResult => ({
  success: false,
  providerName: provider.providerName,
  responseSummary: null,
  errorMessage: error instanceof Error ? error.message : 'Unknown provider execution error',
  failureCategory: 'provider_execution_error'
});

export const createEventProcessingJobHandler =
  ({
    eventService,
    subscriptionService,
    deliveryService,
    deliveryAttemptRepository,
    providerFactory
  }: EventProcessingWorkerDependencies) =>
  async (
    job: Job<EventProcessingJobPayload> | EventProcessingJobPayload
  ): Promise<EventProcessingResult> => {
    const payload = 'data' in job ? job.data : job;
    const event = await eventService.getStoredEventById(payload.eventId);
    const subscriptions = await subscriptionService.findActiveSubscriptionsByEventType(
      event.eventType
    );

    if (subscriptions.length === 0) {
      await eventService.markCompleted(event.id);

      return {
        eventId: event.id,
        matchedSubscriptions: 0,
        createdDeliveries: 0,
        succeededDeliveries: 0,
        failedDeliveries: 0,
        eventStatus: 'completed'
      };
    }

    const deliveries = await deliveryService.createPendingDeliveries(
      event.id,
      subscriptions
    );

    await eventService.markProcessing(event.id);

    let succeededDeliveries = 0;
    let failedDeliveries = 0;

    for (const delivery of deliveries) {
      const processingDelivery = await deliveryService.markProcessing(delivery.id);
      const provider = providerFactory.getProvider(processingDelivery.channel);
      const providerInput = buildProviderInput(processingDelivery, event);

      let providerResult: NotificationProviderResult;

      try {
        providerResult = await provider.send(providerInput);
      } catch (error) {
        providerResult = normalizeThrownProviderError(provider, error);
      }

      const attemptSequence = processingDelivery.attemptCount + 1;

      await deliveryAttemptRepository.create({
        id: randomUUID(),
        deliveryId: processingDelivery.id,
        attemptSequence,
        channel: processingDelivery.channel,
        providerName: providerResult.providerName,
        outcome: providerResult.success
          ? DeliveryAttemptOutcome.SUCCESS
          : DeliveryAttemptOutcome.FAILURE,
        failureCategory: providerResult.failureCategory,
        errorMessage: providerResult.errorMessage,
        providerResponseSummary: providerResult.responseSummary,
        attemptedAt: new Date()
      });

      if (providerResult.success) {
        await deliveryService.markSucceeded(processingDelivery.id);
        succeededDeliveries += 1;
      } else {
        await deliveryService.markFailed(processingDelivery.id);
        failedDeliveries += 1;
      }
    }

    if (failedDeliveries > 0) {
      await eventService.markFailed(event.id);

      return {
        eventId: event.id,
        matchedSubscriptions: subscriptions.length,
        createdDeliveries: deliveries.length,
        succeededDeliveries,
        failedDeliveries,
        eventStatus: 'failed'
      };
    }

    await eventService.markCompleted(event.id);

    return {
      eventId: event.id,
      matchedSubscriptions: subscriptions.length,
      createdDeliveries: deliveries.length,
      succeededDeliveries,
      failedDeliveries,
      eventStatus: 'completed'
    };
  };

export const createEventProcessingWorker = (
  dependencies: EventProcessingWorkerDependencies
): Worker<EventProcessingJobPayload> => {
  const redisOptions = createRedisOptions(loadEnv());
  const handler = createEventProcessingJobHandler(dependencies);

  return new Worker<EventProcessingJobPayload>(
    EVENT_PROCESSING_QUEUE_NAME,
    async (job) => handler(job),
    {
      connection: redisOptions
    }
  );
};

const bootstrapEventProcessingWorker = async (): Promise<void> => {
  const env = loadEnv();
  const dataSource = await initializeDatabase(env);
  const eventRepository = new EventRepository(dataSource.getRepository(EventEntity));
  const subscriptionRepository = new SubscriptionRepository(
    dataSource.getRepository(SubscriptionEntity)
  );
  const deliveryRepository = new DeliveryRepository(
    dataSource.getRepository(DeliveryEntity)
  );
  const deliveryAttemptRepository = new DeliveryAttemptRepository(
    dataSource.getRepository(DeliveryAttemptEntity)
  );

  const worker = createEventProcessingWorker({
    eventService: new EventService(eventRepository),
    subscriptionService: new SubscriptionService(subscriptionRepository),
    deliveryService: new DeliveryService(deliveryRepository),
    deliveryAttemptRepository,
    providerFactory: createDefaultProviderFactory()
  });

  console.log('Event processing worker listening for jobs');

  const shutdown = async (): Promise<void> => {
    await worker.close();

    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }

    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });
};

if (require.main === module) {
  bootstrapEventProcessingWorker().catch((error: unknown) => {
    console.error('Failed to start event processing worker', error);
    process.exit(1);
  });
}
