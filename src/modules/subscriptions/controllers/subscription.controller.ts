import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { NotificationChannel, SubscriptionStatus } from '../../../types/notification';
import { successResponse } from '../../../utils/response.util';
import { parseCreateSubscriptionDto } from '../dto/create-subscription.dto';
import { parseUpdateSubscriptionDto } from '../dto/update-subscription.dto';
import { SubscriptionService } from '../services/subscription.service';

const subscriptionIdParamsSchema = z.object({
  subscriptionId: z.string().uuid('subscriptionId must be a valid UUID')
});

const listSubscriptionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  eventType: z.string().trim().min(1).optional(),
  channel: z.nativeEnum(NotificationChannel).optional(),
  status: z.nativeEnum(SubscriptionStatus).optional()
});

export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  createSubscription = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const payload = parseCreateSubscriptionDto(req.body);
      const subscription = await this.subscriptionService.createSubscription(payload);

      res.status(201).json(successResponse(subscription));
    } catch (error) {
      next(error);
    }
  };

  listSubscriptions = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = listSubscriptionsQuerySchema.parse(req.query);
      const subscriptions = await this.subscriptionService.listSubscriptions(query);

      res.status(200).json(successResponse(subscriptions));
    } catch (error) {
      next(error);
    }
  };

  getSubscriptionById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { subscriptionId } = subscriptionIdParamsSchema.parse(req.params);
      const subscription = await this.subscriptionService.getSubscriptionById(
        subscriptionId
      );

      res.status(200).json(successResponse(subscription));
    } catch (error) {
      next(error);
    }
  };

  updateSubscription = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { subscriptionId } = subscriptionIdParamsSchema.parse(req.params);
      const payload = parseUpdateSubscriptionDto(req.body);
      const subscription = await this.subscriptionService.updateSubscription(
        subscriptionId,
        payload
      );

      res.status(200).json(successResponse(subscription));
    } catch (error) {
      next(error);
    }
  };
}
