import { Job, Worker } from 'bullmq';

import {
  createDeliveryRetryQueue,
  DELIVERY_RETRY_QUEUE_NAME,
  DeliveryRetryJobPayload
} from '../config/bullmq';
import { initializeDatabase } from '../config/database';
import { loadEnv } from '../config/env';
import { createRedisOptions } from '../config/redis';
import { DeliveryAttemptEntity } from '../modules/delivery-attempts/entities/delivery-attempt.entity';
import { DeliveryAttemptRepository } from '../modules/delivery-attempts/repositories/delivery-attempt.repository';
import { DeliveryEntity } from '../modules/deliveries/entities/delivery.entity';
import { DeliveryRepository } from '../modules/deliveries/repositories/delivery.repository';
import { DeliveryFailureClassificationService } from '../modules/deliveries/services/delivery-failure-classification.service';
import { DeliveryRetryPolicyService } from '../modules/deliveries/services/delivery-retry-policy.service';
import { DeliveryService } from '../modules/deliveries/services/delivery.service';
import { EventEntity } from '../modules/events/entities/event.entity';
import { EventRepository } from '../modules/events/repositories/event.repository';
import { EventService } from '../modules/events/services/event.service';
import {
  createDefaultProviderFactory,
  NotificationProviderFactory
} from '../providers/provider.factory';
import {
  buildEnqueueDeliveryRetry,
  EnqueueDeliveryRetry
} from '../queues/producers/delivery-retry.producer';
import {
  executeDeliveryAttempt,
  isEligibleForRetrySend,
  synchronizeEventStatus
} from './delivery-execution';

export interface DeliveryRetryWorkerDependencies {
  eventService: EventService;
  deliveryService: DeliveryService;
  deliveryAttemptRepository: DeliveryAttemptRepository;
  providerFactory: NotificationProviderFactory;
  failureClassificationService: DeliveryFailureClassificationService;
  retryPolicyService: DeliveryRetryPolicyService;
  enqueueDeliveryRetry: EnqueueDeliveryRetry;
}

export interface DeliveryRetryResult {
  deliveryId: string;
  eventId: string;
  attempted: boolean;
  deliveryStatus: string;
  eventStatus: 'completed' | 'failed' | 'processing';
}

export const createDeliveryRetryJobHandler =
  ({
    eventService,
    deliveryService,
    deliveryAttemptRepository,
    providerFactory,
    failureClassificationService,
    retryPolicyService,
    enqueueDeliveryRetry
  }: DeliveryRetryWorkerDependencies) =>
  async (
    job: Job<DeliveryRetryJobPayload> | DeliveryRetryJobPayload
  ): Promise<DeliveryRetryResult> => {
    const payload = 'data' in job ? job.data : job;
    const delivery = await deliveryService.getDeliveryById(payload.deliveryId);

    if (!delivery) {
      throw new Error(`Delivery ${payload.deliveryId} not found for retry processing`);
    }

    const event = await eventService.getStoredEventById(delivery.eventId);

    if (!isEligibleForRetrySend(delivery, payload.scheduledRetryCount)) {
      const summary = await synchronizeEventStatus(
        event.id,
        eventService,
        deliveryService
      );

      return {
        deliveryId: delivery.id,
        eventId: event.id,
        attempted: false,
        deliveryStatus: delivery.status,
        eventStatus: summary.eventStatus
      };
    }

    const result = await executeDeliveryAttempt(delivery, event, {
      deliveryService,
      deliveryAttemptRepository,
      providerFactory,
      failureClassificationService,
      retryPolicyService,
      enqueueDeliveryRetry
    });
    const summary = await synchronizeEventStatus(
      event.id,
      eventService,
      deliveryService
    );

    return {
      deliveryId: delivery.id,
      eventId: event.id,
      attempted: true,
      deliveryStatus: result.delivery.status,
      eventStatus: summary.eventStatus
    };
  };

export const createDeliveryRetryWorker = (
  dependencies: DeliveryRetryWorkerDependencies
): Worker<DeliveryRetryJobPayload> => {
  const redisOptions = createRedisOptions(loadEnv());
  const handler = createDeliveryRetryJobHandler(dependencies);

  return new Worker<DeliveryRetryJobPayload>(
    DELIVERY_RETRY_QUEUE_NAME,
    async (job) => handler(job),
    {
      connection: redisOptions
    }
  );
};

const bootstrapDeliveryRetryWorker = async (): Promise<void> => {
  const env = loadEnv();
  const dataSource = await initializeDatabase(env);
  const redisOptions = createRedisOptions(env);
  const retryQueue = createDeliveryRetryQueue(redisOptions);
  const eventRepository = new EventRepository(dataSource.getRepository(EventEntity));
  const deliveryRepository = new DeliveryRepository(
    dataSource.getRepository(DeliveryEntity)
  );
  const deliveryAttemptRepository = new DeliveryAttemptRepository(
    dataSource.getRepository(DeliveryAttemptEntity)
  );
  const retryPolicyService = new DeliveryRetryPolicyService({
    defaultMaxRetryLimit: env.DEFAULT_MAX_RETRY_LIMIT,
    retryBaseDelayMs: env.RETRY_BASE_DELAY_MS
  });

  const worker = createDeliveryRetryWorker({
    eventService: new EventService(eventRepository),
    deliveryService: new DeliveryService(
      deliveryRepository,
      retryPolicyService.getDefaultMaxRetryLimit()
    ),
    deliveryAttemptRepository,
    providerFactory: createDefaultProviderFactory(
      env.WEBHOOK_SIGNING_SECRET_DEFAULT
    ),
    failureClassificationService: new DeliveryFailureClassificationService(),
    retryPolicyService,
    enqueueDeliveryRetry: buildEnqueueDeliveryRetry(retryQueue)
  });

  console.log('Delivery retry worker listening for jobs');

  const shutdown = async (): Promise<void> => {
    await worker.close();
    await retryQueue.close();

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
  bootstrapDeliveryRetryWorker().catch((error: unknown) => {
    console.error('Failed to start delivery retry worker', error);
    process.exit(1);
  });
}
