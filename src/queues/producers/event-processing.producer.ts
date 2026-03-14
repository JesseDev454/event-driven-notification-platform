import { Queue } from 'bullmq';

import {
  EventProcessingJobPayload,
  getEventProcessingQueue
} from '../../config/bullmq';

export type EnqueueEventProcessing = (
  eventId: string,
  correlationId?: string
) => Promise<void>;

export const buildEnqueueEventProcessing = (
  queue: Queue<EventProcessingJobPayload>
): EnqueueEventProcessing => {
  return async (eventId: string, correlationId?: string): Promise<void> => {
    const payload: EventProcessingJobPayload = correlationId
      ? { eventId, correlationId }
      : { eventId };

    await queue.add(`event:${eventId}`, payload);
  };
};

export const enqueueEventProcessing: EnqueueEventProcessing = async (
  eventId,
  correlationId
) => {
  const queue = getEventProcessingQueue();
  const enqueue = buildEnqueueEventProcessing(queue);

  await enqueue(eventId, correlationId);
};
