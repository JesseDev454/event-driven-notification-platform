import { NotificationChannel } from '../types/notification';
import { EmailProvider } from './email/email.provider';
import {
  NotificationProvider
} from './interfaces/notification-provider.interface';
import { SmsProvider } from './sms/sms.provider';
import { WebhookProvider } from './webhook/webhook.provider';

export interface NotificationProviderFactory {
  getProvider(channel: NotificationChannel): NotificationProvider;
}

export class ProviderFactory implements NotificationProviderFactory {
  private readonly providersByChannel: Map<NotificationChannel, NotificationProvider>;

  constructor(providers: NotificationProvider[]) {
    this.providersByChannel = new Map(
      providers.map((provider) => [provider.channel, provider])
    );
  }

  getProvider(channel: NotificationChannel): NotificationProvider {
    const provider = this.providersByChannel.get(channel);

    if (!provider) {
      throw new Error(`No notification provider configured for channel ${channel}`);
    }

    return provider;
  }
}

export const createDefaultProviderFactory = (
  webhookSigningSecret: string
): NotificationProviderFactory =>
  new ProviderFactory([
    new EmailProvider(),
    new WebhookProvider({ signingSecret: webhookSigningSecret }),
    new SmsProvider()
  ]);
