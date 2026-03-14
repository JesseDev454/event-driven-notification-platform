import { FindOptionsWhere, Repository } from 'typeorm';

import { NotificationChannel, SubscriptionStatus } from '../../../types/notification';
import { SubscriptionEntity } from '../entities/subscription.entity';

export interface CreateSubscriptionInput {
  id: string;
  eventType: string;
  channel: NotificationChannel;
  target: string;
}

export interface UpdateSubscriptionInput {
  status?: SubscriptionStatus;
  target?: string;
}

export interface SubscriptionListFilters {
  page: number;
  limit: number;
  eventType?: string;
  channel?: NotificationChannel;
  status?: SubscriptionStatus;
}

export class SubscriptionRepository {
  constructor(private readonly repository: Repository<SubscriptionEntity>) {}

  async create(input: CreateSubscriptionInput): Promise<SubscriptionEntity> {
    const subscription = this.repository.create({
      id: input.id,
      eventType: input.eventType,
      channel: input.channel,
      target: input.target,
      status: SubscriptionStatus.ACTIVE
    });

    return this.repository.save(subscription);
  }

  async findById(subscriptionId: string): Promise<SubscriptionEntity | null> {
    return this.repository.findOne({ where: { id: subscriptionId } });
  }

  async list(
    filters: SubscriptionListFilters
  ): Promise<{ items: SubscriptionEntity[]; total: number }> {
    const where: FindOptionsWhere<SubscriptionEntity> = {};

    if (filters.eventType) {
      where.eventType = filters.eventType;
    }

    if (filters.channel) {
      where.channel = filters.channel;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const [items, total] = await this.repository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit
    });

    return { items, total };
  }

  async update(
    subscription: SubscriptionEntity,
    updates: UpdateSubscriptionInput
  ): Promise<SubscriptionEntity> {
    if (updates.status !== undefined) {
      subscription.status = updates.status;
    }

    if (updates.target !== undefined) {
      subscription.target = updates.target;
    }

    return this.repository.save(subscription);
  }

  async findActiveByEventType(eventType: string): Promise<SubscriptionEntity[]> {
    return this.repository.find({
      where: {
        eventType,
        status: SubscriptionStatus.ACTIVE
      },
      order: { createdAt: 'ASC' }
    });
  }
}
