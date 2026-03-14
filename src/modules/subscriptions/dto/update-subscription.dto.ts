import { z } from 'zod';

import { SubscriptionStatus } from '../../../types/notification';

export const updateSubscriptionSchema = z
  .object({
    status: z.nativeEnum(SubscriptionStatus).optional(),
    target: z.string().trim().min(1, 'target must not be empty').optional()
  })
  .strict()
  .refine((value) => value.status !== undefined || value.target !== undefined, {
    message: 'At least one mutable field must be provided'
  });

export type UpdateSubscriptionDto = z.infer<typeof updateSubscriptionSchema>;

export const parseUpdateSubscriptionDto = (
  input: unknown
): UpdateSubscriptionDto => updateSubscriptionSchema.parse(input);
