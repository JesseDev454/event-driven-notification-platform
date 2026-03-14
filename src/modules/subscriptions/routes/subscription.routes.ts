import { RequestHandler, Router } from 'express';

import { SubscriptionService } from '../services/subscription.service';
import { SubscriptionController } from '../controllers/subscription.controller';

export const createSubscriptionRouter = (
  subscriptionService: SubscriptionService,
  adminAuthMiddleware: RequestHandler
): Router => {
  const router = Router();
  const controller = new SubscriptionController(subscriptionService);

  router.use(adminAuthMiddleware);
  router.post('/', controller.createSubscription);
  router.get('/', controller.listSubscriptions);
  router.get('/:subscriptionId', controller.getSubscriptionById);
  router.patch('/:subscriptionId', controller.updateSubscription);

  return router;
};
