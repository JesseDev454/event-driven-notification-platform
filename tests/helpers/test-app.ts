import { DataType, newDb } from 'pg-mem';
import { DataSource } from 'typeorm';

import { createApp } from '../../src/app';
import { EventEntity } from '../../src/modules/events/entities/event.entity';
import { EventRepository } from '../../src/modules/events/repositories/event.repository';
import { EventService } from '../../src/modules/events/services/event.service';
import { EnqueueEventProcessing } from '../../src/queues/producers/event-processing.producer';

export interface TestAppContext {
  app: ReturnType<typeof createApp>;
  dataSource: DataSource;
  enqueueEventProcessing: jest.MockedFunction<EnqueueEventProcessing>;
  cleanup: () => Promise<void>;
}

export const createTestApp = async (): Promise<TestAppContext> => {
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
    entities: [EventEntity],
    synchronize: true
  });

  await dataSource.initialize();

  const eventRepository = new EventRepository(dataSource.getRepository(EventEntity));
  const enqueueEventProcessing: jest.MockedFunction<EnqueueEventProcessing> = jest
    .fn()
    .mockResolvedValue(undefined);
  const eventService = new EventService(eventRepository, enqueueEventProcessing);
  const app = createApp({ eventService });

  return {
    app,
    dataSource,
    enqueueEventProcessing,
    cleanup: async () => {
      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }
    }
  };
};
