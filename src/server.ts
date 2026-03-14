import { createApp } from './app';
import { createEventProcessingQueue, setEventProcessingQueue } from './config/bullmq';
import { initializeDatabase } from './config/database';
import { loadEnv } from './config/env';
import { createRedisConnection, createRedisOptions } from './config/redis';
import { EventEntity } from './modules/events/entities/event.entity';
import { EventRepository } from './modules/events/repositories/event.repository';
import { EventService } from './modules/events/services/event.service';

const bootstrap = async (): Promise<void> => {
  const env = loadEnv();
  const dataSource = await initializeDatabase(env);
  const redisConnection = createRedisConnection(env);
  const redisOptions = createRedisOptions(env);
  await redisConnection.ping();

  const eventProcessingQueue = createEventProcessingQueue(redisOptions);
  setEventProcessingQueue(eventProcessingQueue);

  const eventRepository = new EventRepository(
    dataSource.getRepository(EventEntity)
  );
  const eventService = new EventService(eventRepository);
  const app = createApp({ eventService });

  const server = app.listen(env.PORT, () => {
    console.log(`API server listening on port ${env.PORT}`);
  });

  const shutdown = async (): Promise<void> => {
    server.close(async () => {
      await eventProcessingQueue.close();
      await redisConnection.quit();

      if (dataSource.isInitialized) {
        await dataSource.destroy();
      }

      process.exit(0);
    });
  };

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });
};

bootstrap().catch((error: unknown) => {
  console.error('Failed to start API server', error);
  process.exit(1);
});
