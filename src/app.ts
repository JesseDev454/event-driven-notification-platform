import express, { Express } from 'express';

import { errorHandlerMiddleware } from './middleware/error-handler.middleware';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { EventService } from './modules/events/services/event.service';
import { createEventRouter } from './modules/events/routes/event.routes';

export interface AppDependencies {
  eventService: EventService;
}

export const createApp = ({ eventService }: AppDependencies): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/events', createEventRouter(eventService));
  app.use(errorHandlerMiddleware);

  return app;
};
