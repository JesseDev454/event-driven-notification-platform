import { NotificationChannel } from '../../types/notification';

export interface NotificationSendInput {
  deliveryId: string;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  channel: NotificationChannel;
  target: string;
  correlationId?: string | null;
}

export interface NotificationProviderResult {
  success: boolean;
  providerName: string;
  responseSummary: string | null;
  errorMessage: string | null;
  failureCategory: string | null;
}

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  readonly providerName: string;
  send(input: NotificationSendInput): Promise<NotificationProviderResult>;
}
