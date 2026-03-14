import { DataType, newDb } from 'pg-mem';
import { DataSource } from 'typeorm';

import { createApp } from '../../src/app';
import { DEFAULT_PRODUCER_REFERENCE } from '../../src/config/security';
import {
  ADMIN_API_KEY_HEADER,
  PRODUCER_API_KEY_HEADER,
  PRODUCER_REFERENCE_HEADER
} from '../../src/middleware/auth.constants';
import { DeliveryAttemptEntity } from '../../src/modules/delivery-attempts/entities/delivery-attempt.entity';
import { DeliveryAttemptRepository } from '../../src/modules/delivery-attempts/repositories/delivery-attempt.repository';
import { DeliveryEntity } from '../../src/modules/deliveries/entities/delivery.entity';
import { DeliveryRepository } from '../../src/modules/deliveries/repositories/delivery.repository';
import { DeliveryFailureClassificationService } from '../../src/modules/deliveries/services/delivery-failure-classification.service';
import { DeliveryInspectionService } from '../../src/modules/deliveries/services/delivery-inspection.service';
import { DeliveryRetryPolicyService } from '../../src/modules/deliveries/services/delivery-retry-policy.service';
import { DeliveryService } from '../../src/modules/deliveries/services/delivery.service';
import { EventEntity } from '../../src/modules/events/entities/event.entity';
import { EventRepository } from '../../src/modules/events/repositories/event.repository';
import { EventService } from '../../src/modules/events/services/event.service';
import {
  createDeliveryRetryJobHandler,
  DeliveryRetryResult
} from '../../src/workers/delivery-retry.worker';
import {
  createEventProcessingJobHandler,
  EventProcessingResult
} from '../../src/workers/event-processing.worker';
import { EnqueueDeliveryRetry } from '../../src/queues/producers/delivery-retry.producer';
import { EnqueueEventProcessing } from '../../src/queues/producers/event-processing.producer';
import {
  NotificationProviderFactory,
  createDefaultProviderFactory
} from '../../src/providers/provider.factory';
import { SubscriptionEntity } from '../../src/modules/subscriptions/entities/subscription.entity';
import { SubscriptionRepository } from '../../src/modules/subscriptions/repositories/subscription.repository';
import { SubscriptionService } from '../../src/modules/subscriptions/services/subscription.service';

export interface CreateTestAppOptions {
  providerFactory?: NotificationProviderFactory;
  defaultMaxRetryLimit?: number;
  retryBaseDelayMs?: number;
  producerApiKey?: string;
  adminApiKey?: string;
  defaultProducerReference?: string;
  webhookSigningSecret?: string;
}

export interface TestAppContext {
  app: ReturnType<typeof createApp>;
  dataSource: DataSource;
  enqueueEventProcessing: jest.MockedFunction<EnqueueEventProcessing>;
  enqueueDeliveryRetry: jest.MockedFunction<EnqueueDeliveryRetry>;
  authHeaders: {
    producer: Record<string, string>;
    admin: Record<string, string>;
  };
  eventService: EventService;
  subscriptionService: SubscriptionService;
  deliveryService: DeliveryService;
  deliveryInspectionService: DeliveryInspectionService;
  deliveryAttemptRepository: DeliveryAttemptRepository;
  providerFactory: NotificationProviderFactory;
  retryPolicyService: DeliveryRetryPolicyService;
  processEventJob: (eventId: string, correlationId?: string) => Promise<EventProcessingResult>;
  processRetryJob: (
    deliveryId: string,
    eventId: string,
    scheduledRetryCount: number,
    correlationId?: string
  ) => Promise<DeliveryRetryResult>;
  cleanup: () => Promise<void>;
}

export const createTestApp = async (
  options: CreateTestAppOptions = {}
): Promise<TestAppContext> => {
  const db = newDb({ autoCreateForeignKeyIndices: true });

  db.public.registerFunction({
    name: 'current_database',
    implementation: () => 'event_notification_platform_test',
    returns: DataType.text
  });

  db.public.registerFunction({
    name: 'version',
    implementation: () => 'PostgreSQL 16.0',
    returns: DataType.text
  });

  const dataSource = db.adapters.createTypeormDataSource({
    type: 'postgres',
    entities: [
      EventEntity,
      SubscriptionEntity,
      DeliveryEntity,
      DeliveryAttemptEntity
    ],
    synchronize: true
  });

  await dataSource.initialize();

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
  const enqueueEventProcessing: jest.MockedFunction<EnqueueEventProcessing> = jest
    .fn()
    .mockResolvedValue(undefined);
  const enqueueDeliveryRetry: jest.MockedFunction<EnqueueDeliveryRetry> = jest
    .fn()
    .mockResolvedValue(undefined);
  const producerApiKey = options.producerApiKey ?? 'test-producer-api-key';
  const adminApiKey = options.adminApiKey ?? 'test-admin-api-key';
  const defaultProducerReference =
    options.defaultProducerReference ?? DEFAULT_PRODUCER_REFERENCE;
  const retryPolicyService = new DeliveryRetryPolicyService({
    defaultMaxRetryLimit: options.defaultMaxRetryLimit ?? 3,
    retryBaseDelayMs: options.retryBaseDelayMs ?? 1000
  });
  const eventService = new EventService(eventRepository, enqueueEventProcessing);
  const subscriptionService = new SubscriptionService(subscriptionRepository);
  const deliveryService = new DeliveryService(
    deliveryRepository,
    retryPolicyService.getDefaultMaxRetryLimit()
  );
  const deliveryInspectionService = new DeliveryInspectionService(
    deliveryRepository,
    deliveryAttemptRepository
  );
  const providerFactory =
    options.providerFactory ??
    createDefaultProviderFactory(
      options.webhookSigningSecret ?? 'test-webhook-signing-secret'
    );
  const failureClassificationService = new DeliveryFailureClassificationService();
  const processEventJobHandler = createEventProcessingJobHandler({
    eventService,
    subscriptionService,
    deliveryService,
    deliveryAttemptRepository,
    providerFactory,
    failureClassificationService,
    retryPolicyService,
    enqueueDeliveryRetry
  });
  const processRetryJobHandler = createDeliveryRetryJobHandler({
    eventService,
    deliveryService,
    deliveryAttemptRepository,
    providerFactory,
    failureClassificationService,
    retryPolicyService,
    enqueueDeliveryRetry
  });
  const app = createApp({
    eventService,
    subscriptionService,
    deliveryInspectionService,
    securityConfig: {
      producerApiKey,
      adminApiKey,
      defaultProducerReference
    }
  });

  return {
    app,
    dataSource,
    enqueueEventProcessing,
    enqueueDeliveryRetry,
    authHeaders: {
      producer: {
        [PRODUCER_API_KEY_HEADER]: producerApiKey,
        [PRODUCER_REFERENCE_HEADER]: defaultProducerReference
      },
      admin: {
        [ADMIN_API_KEY_HEADER]: adminApiKey
      }
    },
    eventService,
    subscriptionService,
    deliveryService,
    deliveryInspectionService,
    deliveryAttemptRepository,
    providerFactory,
    retryPolicyService,
    processEventJob: async (eventId: string, correlationId?: string) =>
      processEventJobHandler({
        eventId,
        ...(correlationId ? { correlationId } : {})
      }),
    processRetryJob: async (
      deliveryId: string,
      eventId: string,
      scheduledRetryCount: number,
      correlationId?: string
    ) =>
      processRetryJobHandler({
        deliveryId,
        eventId,
        scheduledRetryCount,
        ...(correlationId ? { correlationId } : {})
      }),
    cleanup: async () => {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }
  };
};
