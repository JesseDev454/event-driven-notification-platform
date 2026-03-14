import {
  NotificationProvider,
  NotificationProviderResult,
  NotificationSendInput
} from '../interfaces/notification-provider.interface';
import { NotificationChannel } from '../../types/notification';

export class EmailProvider implements NotificationProvider {
  readonly channel = NotificationChannel.EMAIL;
  readonly providerName = 'mock-email-provider';

  async send(input: NotificationSendInput): Promise<NotificationProviderResult> {
    return {
      success: true,
      providerName: this.providerName,
      responseSummary: `Mock email accepted for ${input.target}`,
      errorMessage: null,
      failureCategory: null
    };
  }
}
