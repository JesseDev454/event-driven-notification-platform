import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

import { NotificationChannel, DeliveryStatus } from '../../../types/notification';
import { successResponse } from '../../../utils/response.util';
import { DeliveryInspectionService } from '../services/delivery-inspection.service';

const deliveryIdParamsSchema = z.object({
  deliveryId: z.string().uuid('deliveryId must be a valid UUID')
});

const dateQuerySchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Invalid date value'
      });

      return z.NEVER;
    }

    return parsed;
  });

const listDeliveriesQuerySchema = z
  .object({
    eventId: z.string().uuid().optional(),
    subscriptionId: z.string().uuid().optional(),
    status: z.nativeEnum(DeliveryStatus).optional(),
    channel: z.nativeEnum(NotificationChannel).optional(),
    correlationId: z.string().trim().min(1).optional(),
    createdFrom: dateQuerySchema.optional(),
    createdTo: dateQuerySchema.optional(),
    updatedFrom: dateQuerySchema.optional(),
    updatedTo: dateQuerySchema.optional(),
    limit: z.coerce.number().int().positive().max(100).default(50),
    cursor: z.string().trim().min(1).optional(),
    sort: z
      .enum([
        'createdAt:desc',
        'createdAt:asc',
        'updatedAt:desc',
        'updatedAt:asc'
      ])
      .default('createdAt:desc')
  })
  .superRefine((value, ctx) => {
    if (value.createdFrom && value.createdTo && value.createdFrom > value.createdTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'createdFrom must be earlier than or equal to createdTo',
        path: ['createdFrom']
      });
    }

    if (value.updatedFrom && value.updatedTo && value.updatedFrom > value.updatedTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'updatedFrom must be earlier than or equal to updatedTo',
        path: ['updatedFrom']
      });
    }
  });

const listAttemptsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  cursor: z.string().trim().min(1).optional(),
  sort: z.enum(['attemptedAt:asc', 'attemptedAt:desc']).default('attemptedAt:asc')
});

export class DeliveryController {
  constructor(private readonly deliveryInspectionService: DeliveryInspectionService) {}

  listDeliveries = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = listDeliveriesQuerySchema.parse(req.query);
      const result = await this.deliveryInspectionService.listDeliveries(query);

      res.status(200).json(
        successResponse(result.items, {
          requestId: req.requestId,
          pagination: result.pagination
        })
      );
    } catch (error) {
      next(error);
    }
  };

  getDeliveryById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { deliveryId } = deliveryIdParamsSchema.parse(req.params);
      const delivery = await this.deliveryInspectionService.getDeliveryById(
        deliveryId
      );

      res
        .status(200)
        .json(successResponse(delivery, { requestId: req.requestId }));
    } catch (error) {
      next(error);
    }
  };

  listDeliveryAttempts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { deliveryId } = deliveryIdParamsSchema.parse(req.params);
      const query = listAttemptsQuerySchema.parse(req.query);
      const result = await this.deliveryInspectionService.listAttemptsForDelivery(
        deliveryId,
        query
      );

      res.status(200).json(
        successResponse(result.items, {
          requestId: req.requestId,
          pagination: result.pagination
        })
      );
    } catch (error) {
      next(error);
    }
  };
}
