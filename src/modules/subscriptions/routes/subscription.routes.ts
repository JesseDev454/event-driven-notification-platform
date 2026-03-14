import { Router } from 'express';

import { SubscriptionService } from '../services/subscription.service';
import { SubscriptionController } from '../controllers/subscription.controller';

export const createSubscriptionRouter = (
  subscriptionService: SubscriptionService
): Router => {
  const router = Router();
  const controller = new SubscriptionController(subscriptionService);

  router.post('/', controller.createSubscription);
  router.get('/', controller.listSubscriptions);
  router.get('/:subscriptionId', controller.getSubscriptionById);
  router.patch('/:subscriptionId', controller.updateSubscription);

  return router;
};
