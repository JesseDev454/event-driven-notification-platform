import { createHmac } from 'node:crypto';

export interface WebhookSignatureInput {
  payload: string;
  secret: string;
  timestamp: string;
}

export const signWebhookPayload = ({
  payload,
  secret,
  timestamp
}: WebhookSignatureInput): string => {
  const signer = createHmac('sha256', secret);

  signer.update(`${timestamp}.${payload}`);

  return signer.digest('hex');
};
