import { ConnectionOptions, Queue } from 'bullmq';

export const EVENT_PROCESSING_QUEUE_NAME = 'event-processing';
export const DELIVERY_RETRY_QUEUE_NAME = 'delivery-retry';

export interface EventProcessingJobPayload {
  eventId: string;
  correlationId?: string;
}

export interface DeliveryRetryJobPayload {
  deliveryId: string;
  eventId: string;
  scheduledRetryCount: number;
  correlationId?: string;
}

let eventProcessingQueue: Queue<EventProcessingJobPayload> | null = null;
let deliveryRetryQueue: Queue<DeliveryRetryJobPayload> | null = null;

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

export const createDeliveryRetryQueue = (
  connection: ConnectionOptions
): Queue<DeliveryRetryJobPayload> =>
  new Queue(DELIVERY_RETRY_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 1000,
      removeOnFail: 1000
    }
  }) as Queue<DeliveryRetryJobPayload>;

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

export const setDeliveryRetryQueue = (
  queue: Queue<DeliveryRetryJobPayload>
): Queue<DeliveryRetryJobPayload> => {
  deliveryRetryQueue = queue;
  return queue;
};

export const getDeliveryRetryQueue = (): Queue<DeliveryRetryJobPayload> => {
  if (!deliveryRetryQueue) {
    throw new Error('Delivery retry queue has not been initialized');
  }

  return deliveryRetryQueue;
};
