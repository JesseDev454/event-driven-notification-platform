import { QueryFailedError, Repository } from 'typeorm';

import {
  finalizeCursorPagination,
  resolveCursorPagination
} from '../../../utils/pagination.util';
import {
  DeliveryAttemptOutcome,
  NotificationChannel
} from '../../../types/notification';
import { DeliveryAttemptEntity } from '../entities/delivery-attempt.entity';

export interface CreateDeliveryAttemptInput {
  id: string;
  deliveryId: string;
  channel: NotificationChannel;
  providerName: string;
  outcome: DeliveryAttemptOutcome;
  failureCategory?: string | null;
  errorMessage?: string | null;
  providerResponseSummary?: string | null;
  attemptedAt: Date;
}

export type DeliveryAttemptInspectionSort =
  | 'attemptedAt:asc'
  | 'attemptedAt:desc';

export interface DeliveryAttemptListFilters {
  deliveryId: string;
  limit: number;
  cursor?: string;
  sort: DeliveryAttemptInspectionSort;
}

export interface DeliveryAttemptListPage {
  items: DeliveryAttemptEntity[];
  nextCursor: string | null;
}

const ATTEMPT_SORT_DIRECTION_MAP: Record<
  DeliveryAttemptInspectionSort,
  'ASC' | 'DESC'
> = {
  'attemptedAt:asc': 'ASC',
  'attemptedAt:desc': 'DESC'
};

const isUniqueConstraintError = (error: unknown): boolean => {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }

  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';

  return message.includes('unique') || message.includes('duplicate');
};

export class DeliveryAttemptRepository {
  constructor(private readonly repository: Repository<DeliveryAttemptEntity>) {}

  async createNextAttempt(
    input: CreateDeliveryAttemptInput
  ): Promise<DeliveryAttemptEntity> {
    const attemptSequence = await this.getNextAttemptSequence(input.deliveryId);
    const attempt = this.repository.create({
      id: input.id,
      deliveryId: input.deliveryId,
      attemptSequence,
      channel: input.channel,
      providerName: input.providerName,
      outcome: input.outcome,
      failureCategory: input.failureCategory ?? null,
      errorMessage: input.errorMessage ?? null,
      providerResponseSummary: input.providerResponseSummary ?? null,
      attemptedAt: input.attemptedAt
    });

    try {
      return await this.repository.save(attempt);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new Error(
          `Duplicate delivery attempt sequence detected for delivery ${input.deliveryId}`
        );
      }

      throw error;
    }
  }

  async findByDeliveryId(deliveryId: string): Promise<DeliveryAttemptEntity[]> {
    return this.repository.find({
      where: { deliveryId },
      order: { attemptSequence: 'ASC' }
    });
  }

  async listByDeliveryId(
    filters: DeliveryAttemptListFilters
  ): Promise<DeliveryAttemptListPage> {
    const { offset, take } = resolveCursorPagination(filters);
    const sortDirection = ATTEMPT_SORT_DIRECTION_MAP[filters.sort];
    const query = this.repository
      .createQueryBuilder('attempt')
      .where('attempt.deliveryId = :deliveryId', { deliveryId: filters.deliveryId })
      .orderBy('attempt.attemptedAt', sortDirection)
      .addOrderBy('attempt.attemptSequence', sortDirection)
      .skip(offset)
      .take(take);

    const items = await query.getMany();

    return finalizeCursorPagination(items, filters.limit, offset);
  }

  async getLatestAttemptSequence(deliveryId: string): Promise<number | null> {
    const latestAttempt = await this.repository.findOne({
      where: { deliveryId },
      order: { attemptSequence: 'DESC' }
    });

    return latestAttempt?.attemptSequence ?? null;
  }

  async getNextAttemptSequence(deliveryId: string): Promise<number> {
    const latestAttemptSequence = await this.getLatestAttemptSequence(deliveryId);

    return (latestAttemptSequence ?? 0) + 1;
  }
}
