import { RequestHandler, Router } from 'express';

import { DeliveryController } from '../controllers/delivery.controller';
import { DeliveryInspectionService } from '../services/delivery-inspection.service';

export const createDeliveryRouter = (
  deliveryInspectionService: DeliveryInspectionService,
  adminAuthMiddleware: RequestHandler
): Router => {
  const router = Router();
  const controller = new DeliveryController(deliveryInspectionService);

  router.use(adminAuthMiddleware);
  router.get('/', controller.listDeliveries);
  router.get('/:deliveryId/attempts', controller.listDeliveryAttempts);
  router.get('/:deliveryId', controller.getDeliveryById);

  return router;
};
