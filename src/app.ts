import express, { Express } from 'express';

import { AppSecurityConfig } from './config/security';
import { createAdminAuthMiddleware } from './middleware/admin-auth.middleware';
import { errorHandlerMiddleware } from './middleware/error-handler.middleware';
import { createProducerAuthMiddleware } from './middleware/producer-auth.middleware';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { DeliveryInspectionService } from './modules/deliveries/services/delivery-inspection.service';
import { createDeliveryRouter } from './modules/deliveries/routes/delivery.routes';
import { EventService } from './modules/events/services/event.service';
import { createEventRouter } from './modules/events/routes/event.routes';
import { SubscriptionService } from './modules/subscriptions/services/subscription.service';
import { createSubscriptionRouter } from './modules/subscriptions/routes/subscription.routes';

export interface AppDependencies {
  eventService: EventService;
  subscriptionService: SubscriptionService;
  deliveryInspectionService: DeliveryInspectionService;
  securityConfig: AppSecurityConfig;
}

export const createApp = ({
  eventService,
  subscriptionService,
  deliveryInspectionService,
  securityConfig
}: AppDependencies): Express => {
  const app = express();
  const producerAuthMiddleware = createProducerAuthMiddleware({
    apiKey: securityConfig.producerApiKey,
    defaultProducerReference: securityConfig.defaultProducerReference
  });
  const adminAuthMiddleware = createAdminAuthMiddleware({
    apiKey: securityConfig.adminApiKey
  });

  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use(
    '/events',
    createEventRouter(
      eventService,
      deliveryInspectionService,
      producerAuthMiddleware,
      adminAuthMiddleware
    )
  );
  app.use('/deliveries', createDeliveryRouter(deliveryInspectionService, adminAuthMiddleware));
  app.use('/subscriptions', createSubscriptionRouter(subscriptionService, adminAuthMiddleware));
  app.use(errorHandlerMiddleware);

  return app;
};
