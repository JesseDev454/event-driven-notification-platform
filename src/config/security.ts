import { EnvConfig } from './env';

export const DEFAULT_PRODUCER_REFERENCE = 'authenticated-producer';

export interface AppSecurityConfig {
  producerApiKey: string;
  adminApiKey: string;
  defaultProducerReference: string;
}

export const createAppSecurityConfig = (env: EnvConfig): AppSecurityConfig => ({
  producerApiKey: env.PRODUCER_API_KEY,
  adminApiKey: env.ADMIN_API_KEY,
  defaultProducerReference: DEFAULT_PRODUCER_REFERENCE
});
