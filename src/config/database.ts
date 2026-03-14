import 'reflect-metadata';

import { DataSource, DataSourceOptions } from 'typeorm';

import { DeliveryAttemptEntity } from '../modules/delivery-attempts/entities/delivery-attempt.entity';
import { DeliveryEntity } from '../modules/deliveries/entities/delivery.entity';
import { EventEntity } from '../modules/events/entities/event.entity';
import { SubscriptionEntity } from '../modules/subscriptions/entities/subscription.entity';
import { EnvConfig } from './env';

let appDataSource: DataSource | null = null;

export const createDatabaseOptions = (env: EnvConfig): DataSourceOptions => ({
  type: 'postgres',
  url: env.DATABASE_URL,
  entities: [EventEntity, SubscriptionEntity, DeliveryEntity, DeliveryAttemptEntity],
  synchronize: true,
  logging: false
});

export const initializeDatabase = async (env: EnvConfig): Promise<DataSource> => {
  if (appDataSource?.isInitialized) {
    return appDataSource;
  }

  appDataSource = new DataSource(createDatabaseOptions(env));

  return appDataSource.initialize();
};

export const getDatabase = (): DataSource => {
  if (!appDataSource?.isInitialized) {
    throw new Error('Database connection has not been initialized');
  }

  return appDataSource;
};
