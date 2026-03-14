import { randomUUID } from 'node:crypto';

import { NotFoundError, ValidationError } from '../../../types/app-error';
import {
  NotificationChannel,
  SubscriptionStatus
} from '../../../types/notification';
import { CreateSubscriptionDto } from '../dto/create-subscription.dto';
import { UpdateSubscriptionDto } from '../dto/update-subscription.dto';
import {
  SubscriptionListFilters,
  SubscriptionRepository
} from '../repositories/subscription.repository';
import { SubscriptionEntity } from '../entities/subscription.entity';

export interface CreatedSubscriptionResult {
  subscriptionId: string;
  status: SubscriptionStatus;
}

export interface SubscriptionDetailResult {
  subscriptionId: string;
  eventType: string;
  channel: NotificationChannel;
  target: string;
  status: SubscriptionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionListResult {
  items: SubscriptionDetailResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class SubscriptionService {
  constructor(private readonly subscriptionRepository: SubscriptionRepository) {}

  async createSubscription(
    input: CreateSubscriptionDto
  ): Promise<CreatedSubscriptionResult> {
    this.validateTargetForChannel(input.channel, input.target);

    const subscription = await this.subscriptionRepository.create({
      id: randomUUID(),
      eventType: input.eventType,
      channel: input.channel,
      target: input.target
    });

    return {
      subscriptionId: subscription.id,
      status: subscription.status
    };
  }

  async listSubscriptions(
    filters: SubscriptionListFilters
  ): Promise<SubscriptionListResult> {
    const { items, total } = await this.subscriptionRepository.list(filters);

    return {
      items: items.map((subscription) => this.toDetail(subscription)),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / filters.limit))
      }
    };
  }

  async getSubscriptionById(
    subscriptionId: string
  ): Promise<SubscriptionDetailResult> {
    const subscription = await this.subscriptionRepository.findById(subscriptionId);

    if (!subscription) {
      throw new NotFoundError('Subscription not found', 'subscription_not_found');
    }

    return this.toDetail(subscription);
  }

  async updateSubscription(
    subscriptionId: string,
    updates: UpdateSubscriptionDto
  ): Promise<SubscriptionDetailResult> {
    const subscription = await this.subscriptionRepository.findById(subscriptionId);

    if (!subscription) {
      throw new NotFoundError('Subscription not found', 'subscription_not_found');
    }

    if (updates.target !== undefined) {
      this.validateTargetForChannel(subscription.channel, updates.target);
    }

    const updatedSubscription = await this.subscriptionRepository.update(
      subscription,
      updates
    );

    return this.toDetail(updatedSubscription);
  }

  async findActiveSubscriptionsByEventType(
    eventType: string
  ): Promise<SubscriptionEntity[]> {
    return this.subscriptionRepository.findActiveByEventType(eventType);
  }

  private toDetail(subscription: SubscriptionEntity): SubscriptionDetailResult {
    return {
      subscriptionId: subscription.id,
      eventType: subscription.eventType,
      channel: subscription.channel,
      target: subscription.target,
      status: subscription.status,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt
    };
  }

  private validateTargetForChannel(
    channel: NotificationChannel,
    target: string
  ): void {
    switch (channel) {
      case NotificationChannel.EMAIL: {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailPattern.test(target)) {
          throw new ValidationError(
            'Target must be a valid email address for the email channel',
            'invalid_subscription_target'
          );
        }

        return;
      }

      case NotificationChannel.WEBHOOK: {
        try {
          const url = new URL(target);

          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new ValidationError(
              'Target must be a valid HTTP or HTTPS URL for the webhook channel',
              'invalid_subscription_target'
            );
          }
        } catch (error) {
          if (error instanceof ValidationError) {
            throw error;
          }

          throw new ValidationError(
            'Target must be a valid HTTP or HTTPS URL for the webhook channel',
            'invalid_subscription_target'
          );
        }

        return;
      }

      case NotificationChannel.SMS: {
        const phonePattern = /^\+?[1-9]\d{7,14}$/;

        if (!phonePattern.test(target)) {
          throw new ValidationError(
            'Target must be a valid phone number for the sms channel',
            'invalid_subscription_target'
          );
        }

        return;
      }
    }
  }
}
