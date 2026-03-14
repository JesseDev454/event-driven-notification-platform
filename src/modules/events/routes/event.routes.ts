import { RequestHandler, Router } from 'express';

import { DeliveryInspectionService } from '../../deliveries/services/delivery-inspection.service';
import { EventController } from '../controllers/event.controller';
import { EventService } from '../services/event.service';

export const createEventRouter = (
  eventService: EventService,
  deliveryInspectionService: DeliveryInspectionService,
  producerAuthMiddleware: RequestHandler,
  adminAuthMiddleware: RequestHandler
): Router => {
  const router = Router();
  const controller = new EventController(eventService, deliveryInspectionService);

  router.post('/', producerAuthMiddleware, controller.createEvent);
  router.get('/', adminAuthMiddleware, controller.listEvents);
  router.get('/:eventId/deliveries', adminAuthMiddleware, controller.getEventDeliveries);
  router.get('/:eventId', adminAuthMiddleware, controller.getEventById);

  return router;
};
