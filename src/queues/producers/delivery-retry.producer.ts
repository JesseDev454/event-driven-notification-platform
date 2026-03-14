import { JobsOptions, Queue } from 'bullmq';

import {
  DeliveryRetryJobPayload,
  getDeliveryRetryQueue
} from '../../config/bullmq';

export type EnqueueDeliveryRetry = (
  payload: DeliveryRetryJobPayload,
  delayMs: number
) => Promise<void>;

const buildRetryJobId = (payload: DeliveryRetryJobPayload): string =>
  `delivery-retry:${payload.deliveryId}:retry:${payload.scheduledRetryCount}`;

export const buildEnqueueDeliveryRetry = (
  queue: Queue<DeliveryRetryJobPayload>
): EnqueueDeliveryRetry => {
  return async (
    payload: DeliveryRetryJobPayload,
    delayMs: number
  ): Promise<void> => {
    const jobOptions: JobsOptions = {
      delay: delayMs,
      jobId: buildRetryJobId(payload)
    };

    await queue.add(buildRetryJobId(payload), payload, jobOptions);
  };
};

export const enqueueDeliveryRetry: EnqueueDeliveryRetry = async (
  payload,
  delayMs
) => {
  const queue = getDeliveryRetryQueue();
  const enqueue = buildEnqueueDeliveryRetry(queue);

  await enqueue(payload, delayMs);
};
