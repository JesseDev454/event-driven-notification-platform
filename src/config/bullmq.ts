import { ConnectionOptions, Queue } from 'bullmq';

export const EVENT_PROCESSING_QUEUE_NAME = 'event-processing';

export interface EventProcessingJobPayload {
  eventId: string;
  correlationId?: string;
}

let eventProcessingQueue: Queue<EventProcessingJobPayload> | null = null;

export const createEventProcessingQueue = (
  connection: ConnectionOptions
): Queue<EventProcessingJobPayload> =>
  new Queue(EVENT_PROCESSING_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: 1000
    }
  }) as Queue<EventProcessingJobPayload>;

export const setEventProcessingQueue = (
  queue: Queue<EventProcessingJobPayload>
): Queue<EventProcessingJobPayload> => {
  eventProcessingQueue = queue;
  return queue;
};

export const getEventProcessingQueue = (): Queue<EventProcessingJobPayload> => {
  if (!eventProcessingQueue) {
    throw new Error('Event processing queue has not been initialized');
  }

  return eventProcessingQueue;
};
