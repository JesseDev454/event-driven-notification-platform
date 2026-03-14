import { DeliveryEntity } from '../entities/delivery.entity';

export interface RetryPolicyConfig {
  defaultMaxRetryLimit: number;
  retryBaseDelayMs: number;
}

export interface RetrySchedulingDecision {
  shouldRetry: boolean;
  nextRetryCount: number | null;
  delayMs: number | null;
  nextRetryAt: Date | null;
}

export class DeliveryRetryPolicyService {
  constructor(private readonly config: RetryPolicyConfig) {}

  getDefaultMaxRetryLimit(): number {
    return this.config.defaultMaxRetryLimit;
  }

  evaluateRetry(
    delivery: DeliveryEntity,
    retryable: boolean,
    attemptedAt: Date
  ): RetrySchedulingDecision {
    if (!retryable || delivery.retryCount >= delivery.maxRetryLimit) {
      return {
        shouldRetry: false,
        nextRetryCount: null,
        delayMs: null,
        nextRetryAt: null
      };
    }

    const nextRetryCount = delivery.retryCount + 1;
    const delayMs = this.calculateDelayMs(nextRetryCount);

    return {
      shouldRetry: true,
      nextRetryCount,
      delayMs,
      nextRetryAt: new Date(attemptedAt.getTime() + delayMs)
    };
  }

  private calculateDelayMs(nextRetryCount: number): number {
    return this.config.retryBaseDelayMs * 2 ** (nextRetryCount - 1);
  }
}
