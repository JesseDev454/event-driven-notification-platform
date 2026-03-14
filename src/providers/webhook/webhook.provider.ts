import {
  NotificationProvider,
  NotificationProviderResult,
  NotificationSendInput
} from '../interfaces/notification-provider.interface';
import { NotificationChannel } from '../../types/notification';

export class WebhookProvider implements NotificationProvider {
  readonly channel = NotificationChannel.WEBHOOK;
  readonly providerName = 'webhook-http-provider';

  async send(input: NotificationSendInput): Promise<NotificationProviderResult> {
    try {
      const response = await fetch(input.target, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(input.correlationId ? { 'x-correlation-id': input.correlationId } : {}),
          'x-event-type': input.eventType
        },
        body: JSON.stringify({
          eventId: input.eventId,
          eventType: input.eventType,
          correlationId: input.correlationId ?? null,
          data: input.payload
        })
      });

      const responseSummary = this.buildResponseSummary(response);

      if (response.ok) {
        return {
          success: true,
          providerName: this.providerName,
          responseSummary,
          errorMessage: null,
          failureCategory: null
        };
      }

      return {
        success: false,
        providerName: this.providerName,
        responseSummary,
        errorMessage: `Webhook delivery failed with status ${response.status}`,
        failureCategory: this.classifyFailure(response.status)
      };
    } catch (error) {
      return {
        success: false,
        providerName: this.providerName,
        responseSummary: null,
        errorMessage:
          error instanceof Error ? error.message : 'Unknown webhook delivery error',
        failureCategory: 'network_error'
      };
    }
  }

  private buildResponseSummary(response: Response): string {
    const statusText = response.statusText?.trim();

    return statusText ? `${response.status} ${statusText}` : `${response.status}`;
  }

  private classifyFailure(status: number): string {
    if (status === 401 || status === 403) {
      return 'authorization_failure';
    }

    if (status === 404) {
      return 'invalid_destination';
    }

    if (status >= 500) {
      return 'provider_http_error';
    }

    if (status >= 400) {
      return 'downstream_request_error';
    }

    return 'unknown_failure';
  }
}
