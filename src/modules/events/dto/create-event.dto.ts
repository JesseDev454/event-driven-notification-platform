import { z } from 'zod';

const payloadSchema = z.record(z.unknown());

export const createEventSchema = z
  .object({
    event: z.string().trim().min(1, 'event is required'),
    userId: z.string().trim().min(1).optional(),
    correlationId: z.string().trim().min(1).optional(),
    data: payloadSchema
  })
  .strict();

export type CreateEventDto = z.infer<typeof createEventSchema>;

export const parseCreateEventDto = (input: unknown): CreateEventDto =>
  createEventSchema.parse(input);
