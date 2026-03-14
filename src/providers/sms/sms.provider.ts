import {
  NotificationProvider,
  NotificationProviderResult,
  NotificationSendInput
} from '../interfaces/notification-provider.interface';
import { NotificationChannel } from '../../types/notification';

export class SmsProvider implements NotificationProvider {
  readonly channel = NotificationChannel.SMS;
  readonly providerName = 'mock-sms-provider';

  async send(input: NotificationSendInput): Promise<NotificationProviderResult> {
    return {
      success: true,
      providerName: this.providerName,
      responseSummary: `Mock SMS accepted for ${input.target}`,
      errorMessage: null,
      failureCategory: null
    };
  }
}
