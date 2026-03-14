import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { successResponse } from '../../../utils/response.util';
import { parseCreateEventDto } from '../dto/create-event.dto';
import { EventService } from '../services/event.service';

const eventIdParamsSchema = z.object({
  eventId: z.string().uuid('eventId must be a valid UUID')
});

export class EventController {
  constructor(private readonly eventService: EventService) {}

  createEvent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const payload = parseCreateEventDto(req.body);
      const event = await this.eventService.createEvent(payload);

      res
        .status(201)
        .location(`/events/${event.eventId}`)
        .json(successResponse(event));
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

      res.status(200).json(successResponse(event));
    } catch (error) {
      next(error);
    }
  };
}
