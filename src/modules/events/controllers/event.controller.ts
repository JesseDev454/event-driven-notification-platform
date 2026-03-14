import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { DeliveryInspectionService } from '../../deliveries/services/delivery-inspection.service';
import { CORRELATION_ID_HEADER } from '../../../middleware/auth.constants';
import { DeliveryStatus, NotificationChannel } from '../../../types/notification';
import { successResponse } from '../../../utils/response.util';
import { EventProcessingStatus } from '../entities/event.entity';
import { parseCreateEventDto } from '../dto/create-event.dto';
import { EventService } from '../services/event.service';

const eventIdParamsSchema = z.object({
  eventId: z.string().uuid('eventId must be a valid UUID')
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

const listEventsQuerySchema = z
  .object({
    event: z.string().trim().min(1).optional(),
    processingStatus: z.nativeEnum(EventProcessingStatus).optional(),
    correlationId: z.string().trim().min(1).optional(),
    producerReference: z.string().trim().min(1).optional(),
    acceptedFrom: dateQuerySchema.optional(),
    acceptedTo: dateQuerySchema.optional(),
    limit: z.coerce.number().int().positive().max(100).default(50),
    cursor: z.string().trim().min(1).optional(),
    sort: z
      .enum([
        'acceptedAt:desc',
        'acceptedAt:asc',
        'lastProcessedAt:desc',
        'lastProcessedAt:asc'
      ])
      .default('acceptedAt:desc')
  })
  .superRefine((value, ctx) => {
    if (value.acceptedFrom && value.acceptedTo && value.acceptedFrom > value.acceptedTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'acceptedFrom must be earlier than or equal to acceptedTo',
        path: ['acceptedFrom']
      });
    }
  });

const listEventDeliveriesQuerySchema = z.object({
  status: z.nativeEnum(DeliveryStatus).optional(),
  channel: z.nativeEnum(NotificationChannel).optional(),
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
});

export class EventController {
  constructor(
    private readonly eventService: EventService,
    private readonly deliveryInspectionService: DeliveryInspectionService
  ) {}

  createEvent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsedPayload = parseCreateEventDto(req.body);
      const payload = parsedPayload.correlationId
        ? parsedPayload
        : {
            ...parsedPayload,
            ...(req.correlationId ? { correlationId: req.correlationId } : {})
          };
      const event = await this.eventService.createEvent(payload, {
        producerReference: req.producerReference ?? null
      });

      res.setHeader('X-Correlation-Id', event.correlationId);
      res
        .status(201)
        .location(`/events/${event.eventId}`)
        .json(
          successResponse({
            eventId: event.eventId,
            status: event.status
          })
        );
    } catch (error) {
      next(error);
    }
  };

  listEvents = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const query = listEventsQuerySchema.parse(req.query);
      const result = await this.eventService.listEvents(query);

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

  getEventDeliveries = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { eventId } = eventIdParamsSchema.parse(req.params);
      const query = listEventDeliveriesQuerySchema.parse(req.query);

      await this.eventService.getStoredEventById(eventId);
      const result = await this.deliveryInspectionService.listDeliveries({
        eventId,
        status: query.status,
        channel: query.channel,
        limit: query.limit,
        cursor: query.cursor,
        sort: query.sort
      });

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

  getEventById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { eventId } = eventIdParamsSchema.parse(req.params);
      const event = await this.eventService.getEventById(eventId);

      if (event.correlationId) {
        res.setHeader(CORRELATION_ID_HEADER, event.correlationId);
      }
      res
        .status(200)
        .json(successResponse(event, { requestId: req.requestId }));
    } catch (error) {
      next(error);
    }
  };
}
