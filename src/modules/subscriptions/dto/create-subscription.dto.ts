import { z } from 'zod';

import { NotificationChannel } from '../../../types/notification';

export const createSubscriptionSchema = z
  .object({
    eventType: z.string().trim().min(1, 'eventType is required'),
    channel: z.nativeEnum(NotificationChannel),
    target: z.string().trim().min(1, 'target is required')
  })
  .strict();

export type CreateSubscriptionDto = z.infer<typeof createSubscriptionSchema>;

export const parseCreateSubscriptionDto = (
  input: unknown
): CreateSubscriptionDto => createSubscriptionSchema.parse(input);
