import { randomUUID } from 'node:crypto';

import { DeliveryAttemptRepository } from '../modules/delivery-attempts/repositories/delivery-attempt.repository';
import { DeliveryFailureClassificationService } from '../modules/deliveries/services/delivery-failure-classification.service';
import { DeliveryRetryPolicyService } from '../modules/deliveries/services/delivery-retry-policy.service';
import { DeliveryService } from '../modules/deliveries/services/delivery.service';
import { DeliveryEntity } from '../modules/deliveries/entities/delivery.entity';
import { EventEntity } from '../modules/events/entities/event.entity';
import { EventService } from '../modules/events/services/event.service';
import {
  NotificationProvider,
  NotificationProviderResult,
  NotificationSendInput
} from '../providers/interfaces/notification-provider.interface';
import { NotificationProviderFactory } from '../providers/provider.factory';
import { EnqueueDeliveryRetry } from '../queues/producers/delivery-retry.producer';
import {
  DeliveryAttemptOutcome,
  DeliveryStatus
} from '../types/notification';

export interface DeliveryExecutionDependencies {
  deliveryService: DeliveryService;
  deliveryAttemptRepository: DeliveryAttemptRepository;
  providerFactory: NotificationProviderFactory;
  failureClassificationService: DeliveryFailureClassificationService;
  retryPolicyService: DeliveryRetryPolicyService;
  enqueueDeliveryRetry: EnqueueDeliveryRetry;
}

export interface DeliveryExecutionResult {
  delivery: DeliveryEntity;
  outcome: 'succeeded' | 'retrying' | 'failed';
}

export const buildProviderInput = (
  delivery: DeliveryEntity,
  event: EventEntity
): NotificationSendInput => ({
  deliveryId: delivery.id,
  eventId: event.id,
  eventType: event.eventType,
  payload: event.payload,
  channel: delivery.channel,
  target: delivery.target,
  correlationId: event.correlationId
});

export const normalizeThrownProviderError = (
  provider: NotificationProvider,
  error: unknown
): NotificationProviderResult => ({
  success: false,
  providerName: provider.providerName,
  responseSummary: null,
  errorMessage:
    error instanceof Error ? error.message : 'Unknown provider execution error',
  failureCategory: 'provider_execution_error'
});

export const executeDeliveryAttempt = async (
  delivery: DeliveryEntity,
  event: EventEntity,
  {
    deliveryService,
    deliveryAttemptRepository,
    providerFactory,
    failureClassificationService,
    retryPolicyService,
    enqueueDeliveryRetry
  }: DeliveryExecutionDependencies
): Promise<DeliveryExecutionResult> => {
  const attemptedAt = new Date();
  const processingDelivery = await deliveryService.markProcessing(delivery.id);
  const provider = providerFactory.getProvider(processingDelivery.channel);
  const providerInput = buildProviderInput(processingDelivery, event);

  let providerResult: NotificationProviderResult;

  try {
    providerResult = await provider.send(providerInput);
  } catch (error) {
    providerResult = normalizeThrownProviderError(provider, error);
  }

  const classification = providerResult.success
    ? null
    : failureClassificationService.classify(providerResult);

  await deliveryAttemptRepository.createNextAttempt({
    id: randomUUID(),
    deliveryId: processingDelivery.id,
    channel: processingDelivery.channel,
    providerName: providerResult.providerName,
    outcome: providerResult.success
      ? DeliveryAttemptOutcome.SUCCESS
      : DeliveryAttemptOutcome.FAILURE,
    failureCategory: classification?.category ?? null,
    errorMessage: providerResult.errorMessage,
    providerResponseSummary: providerResult.responseSummary,
    attemptedAt
  });

  if (providerResult.success) {
    return {
      delivery: await deliveryService.markSucceeded(processingDelivery.id),
      outcome: 'succeeded'
    };
  }

  if (!classification) {
    throw new Error(
      `Missing failure classification for delivery ${processingDelivery.id}`
    );
  }

  const retryDecision = retryPolicyService.evaluateRetry(
    processingDelivery,
    classification.retryable,
    attemptedAt
  );
  const errorSummary =
    providerResult.errorMessage ?? providerResult.responseSummary ?? null;

  if (
    retryDecision.shouldRetry &&
    retryDecision.nextRetryCount !== null &&
    retryDecision.nextRetryAt &&
    retryDecision.delayMs !== null
  ) {
    const retryingDelivery = await deliveryService.markRetrying(
      processingDelivery.id,
      retryDecision.nextRetryCount,
      retryDecision.nextRetryAt,
      classification.category,
      errorSummary
    );

    await enqueueDeliveryRetry(
      {
        deliveryId: retryingDelivery.id,
        eventId: event.id,
        scheduledRetryCount: retryingDelivery.retryCount,
        correlationId: event.correlationId ?? undefined
      },
      retryDecision.delayMs
    );

    return {
      delivery: retryingDelivery,
      outcome: 'retrying'
    };
  }

  return {
    delivery: await deliveryService.markFailed(
      processingDelivery.id,
      classification.category,
      errorSummary
    ),
    outcome: 'failed'
  };
};

export const synchronizeEventStatus = async (
  eventId: string,
  eventService: EventService,
  deliveryService: DeliveryService
): Promise<{
  succeededDeliveries: number;
  failedDeliveries: number;
  eventStatus: 'completed' | 'failed' | 'processing';
}> => {
  const summary = await deliveryService.getEventDeliverySummary(eventId);

  if (summary.eventStatus === 'completed') {
    await eventService.markCompleted(eventId);
  } else if (summary.eventStatus === 'failed') {
    await eventService.markFailed(eventId);
  } else {
    await eventService.markProcessing(eventId);
  }

  return {
    succeededDeliveries: summary.succeededDeliveries,
    failedDeliveries: summary.failedDeliveries,
    eventStatus: summary.eventStatus
  };
};

export const isEligibleForInitialSend = (
  delivery: DeliveryEntity,
  latestAttemptSequence: number | null
): boolean => {
  if (
    delivery.status === DeliveryStatus.SUCCEEDED ||
    delivery.status === DeliveryStatus.FAILED ||
    delivery.status === DeliveryStatus.PROCESSING ||
    delivery.status === DeliveryStatus.RETRYING
  ) {
    return false;
  }

  return latestAttemptSequence === null;
};

export const isEligibleForRetrySend = (
  delivery: DeliveryEntity,
  scheduledRetryCount: number
): boolean =>
  delivery.status === DeliveryStatus.RETRYING &&
  delivery.retryCount === scheduledRetryCount;
