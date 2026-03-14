import IORedis, { RedisOptions } from 'ioredis';

import { EnvConfig } from './env';

export const createRedisOptions = (env: EnvConfig): RedisOptions => ({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  maxRetriesPerRequest: null
});

export const createRedisConnection = (env: EnvConfig): IORedis =>
  new IORedis(createRedisOptions(env));
