import { DataType, newDb } from 'pg-mem';
import { DataSource } from 'typeorm';

import { createApp } from '../../src/app';
import { DeliveryAttemptEntity } from '../../src/modules/delivery-attempts/entities/delivery-attempt.entity';
import { DeliveryAttemptRepository } from '../../src/modules/delivery-attempts/repositories/delivery-attempt.repository';
import { DeliveryEntity } from '../../src/modules/deliveries/entities/delivery.entity';
import { DeliveryRepository } from '../../src/modules/deliveries/repositories/delivery.repository';
import { DeliveryService } from '../../src/modules/deliveries/services/delivery.service';
import { EventEntity } from '../../src/modules/events/entities/event.entity';
import { EventRepository } from '../../src/modules/events/repositories/event.repository';
import { EventService } from '../../src/modules/events/services/event.service';
import {
  createEventProcessingJobHandler,
  EventProcessingResult
} from '../../src/workers/event-processing.worker';
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
}

export interface TestAppContext {
  app: ReturnType<typeof createApp>;
  dataSource: DataSource;
  enqueueEventProcessing: jest.MockedFunction<EnqueueEventProcessing>;
  eventService: EventService;
  subscriptionService: SubscriptionService;
  deliveryService: DeliveryService;
  deliveryAttemptRepository: DeliveryAttemptRepository;
  providerFactory: NotificationProviderFactory;
  processEventJob: (eventId: string, correlationId?: string) => Promise<EventProcessingResult>;
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
  const eventService = new EventService(eventRepository, enqueueEventProcessing);
  const subscriptionService = new SubscriptionService(subscriptionRepository);
  const deliveryService = new DeliveryService(deliveryRepository);
  const providerFactory = options.providerFactory ?? createDefaultProviderFactory();
  const processEventJobHandler = createEventProcessingJobHandler({
    eventService,
    subscriptionService,
    deliveryService,
    deliveryAttemptRepository,
    providerFactory
  });
  const app = createApp({ eventService, subscriptionService });

  return {
    app,
    dataSource,
    enqueueEventProcessing,
    eventService,
    subscriptionService,
    deliveryService,
    deliveryAttemptRepository,
    providerFactory,
    processEventJob: async (eventId: string, correlationId?: string) =>
      processEventJobHandler({
        eventId,
        ...(correlationId ? { correlationId } : {})
      }),
    cleanup: async () => {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }
  };
};
