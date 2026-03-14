import { Router } from 'express';

import { EventController } from '../controllers/event.controller';
import { EventService } from '../services/event.service';

export const createEventRouter = (eventService: EventService): Router => {
  const router = Router();
  const controller = new EventController(eventService);

  router.post('/', controller.createEvent);
  router.get('/:eventId', controller.getEventById);

  return router;
};
