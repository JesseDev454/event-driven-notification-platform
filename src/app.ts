import express, { Express } from 'express';

import { errorHandlerMiddleware } from './middleware/error-handler.middleware';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { EventService } from './modules/events/services/event.service';
import { createEventRouter } from './modules/events/routes/event.routes';
import { SubscriptionService } from './modules/subscriptions/services/subscription.service';
import { createSubscriptionRouter } from './modules/subscriptions/routes/subscription.routes';

export interface AppDependencies {
  eventService: EventService;
  subscriptionService: SubscriptionService;
}

export const createApp = ({
  eventService,
  subscriptionService
}: AppDependencies): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/events', createEventRouter(eventService));
  app.use('/subscriptions', createSubscriptionRouter(subscriptionService));
  app.use(errorHandlerMiddleware);

  return app;
};
