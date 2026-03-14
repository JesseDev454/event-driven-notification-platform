import { EmailProvider } from '../../src/providers/email/email.provider';
import { ProviderFactory } from '../../src/providers/provider.factory';
import { SmsProvider } from '../../src/providers/sms/sms.provider';
import { WebhookProvider } from '../../src/providers/webhook/webhook.provider';
import { signWebhookPayload } from '../../src/providers/webhook/webhook-signing.util';
import { NotificationChannel } from '../../src/types/notification';

describe('Sprint 6 notification providers', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns normalized success from the email provider', async () => {
    const provider = new EmailProvider();

    const result = await provider.send({
      deliveryId: 'del-1',
      eventId: 'evt-1',
      eventType: 'order.created',
      payload: {
        data: {
          orderId: 'ORD-1'
        }
      },
      channel: NotificationChannel.EMAIL,
      target: 'ops@example.com',
      correlationId: 'corr-1'
    });

    expect(result).toEqual({
      success: true,
      providerName: 'mock-email-provider',
      responseSummary: 'Mock email accepted for ops@example.com',
      errorMessage: null,
      failureCategory: null
    });
  });

  it('returns normalized success from the sms provider', async () => {
    const provider = new SmsProvider();

    const result = await provider.send({
      deliveryId: 'del-2',
      eventId: 'evt-2',
      eventType: 'payment.received',
      payload: {
        data: {
          paymentId: 'PAY-1'
        }
      },
      channel: NotificationChannel.SMS,
      target: '+2348099999999',
      correlationId: 'corr-2'
    });

    expect(result).toEqual({
      success: true,
      providerName: 'mock-sms-provider',
      responseSummary: 'Mock SMS accepted for +2348099999999',
      errorMessage: null,
      failureCategory: null
    });
  });

  it('posts signed webhook payloads with event and correlation headers', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null, { status: 202, statusText: 'Accepted' }));
    const provider = new WebhookProvider({
      signingSecret: 'test-signing-secret',
      now: () => new Date('2026-03-14T10:00:00.000Z')
    });
    const expectedBody = JSON.stringify({
      eventId: 'evt-3',
      eventType: 'order.created',
      correlationId: 'corr-3',
      data: {
        data: {
          orderId: 'ORD-3'
        }
      }
    });
    const expectedSignature = signWebhookPayload({
      payload: expectedBody,
      secret: 'test-signing-secret',
      timestamp: '1773482400'
    });

    const result = await provider.send({
      deliveryId: 'del-3',
      eventId: 'evt-3',
      eventType: 'order.created',
      payload: {
        data: {
          orderId: 'ORD-3'
        }
      },
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/webhook',
      correlationId: 'corr-3'
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-correlation-id': 'corr-3',
          'x-event-id': 'evt-3',
          'x-event-type': 'order.created',
          'x-timestamp': '1773482400',
          'x-signature': expectedSignature
        }),
        body: expectedBody
      })
    );
    expect(result).toEqual({
      success: true,
      providerName: 'webhook-http-provider',
      responseSummary: '202 Accepted',
      errorMessage: null,
      failureCategory: null
    });
  });

  it('webhook signing output is deterministic for the same payload, secret, and timestamp', () => {
    const payload = JSON.stringify({
      eventId: 'evt-deterministic',
      eventType: 'order.created',
      correlationId: 'corr-deterministic',
      data: {
        data: {
          orderId: 'ORD-DET'
        }
      }
    });

    const firstSignature = signWebhookPayload({
      payload,
      secret: 'same-secret',
      timestamp: '1773482400'
    });
    const secondSignature = signWebhookPayload({
      payload,
      secret: 'same-secret',
      timestamp: '1773482400'
    });

    expect(firstSignature).toBe(secondSignature);
  });

  it('returns normalized webhook failure details', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(null, {
          status: 500,
          statusText: 'Internal Server Error'
        })
      );
    const provider = new WebhookProvider({
      signingSecret: 'test-signing-secret',
      now: () => new Date('2026-03-14T10:00:00.000Z')
    });

    const result = await provider.send({
      deliveryId: 'del-4',
      eventId: 'evt-4',
      eventType: 'invoice.created',
      payload: {
        data: {
          invoiceId: 'INV-4'
        }
      },
      channel: NotificationChannel.WEBHOOK,
      target: 'https://example.com/failing-webhook',
      correlationId: 'corr-4'
    });

    expect(result).toEqual({
      success: false,
      providerName: 'webhook-http-provider',
      responseSummary: '500 Internal Server Error',
      errorMessage: 'Webhook delivery failed with status 500',
      failureCategory: 'provider_http_error'
    });
  });

  it('selects the correct provider for each channel', () => {
    const emailProvider = new EmailProvider();
    const webhookProvider = new WebhookProvider({
      signingSecret: 'test-signing-secret'
    });
    const smsProvider = new SmsProvider();
    const factory = new ProviderFactory([
      emailProvider,
      webhookProvider,
      smsProvider
    ]);

    expect(factory.getProvider(NotificationChannel.EMAIL)).toBe(emailProvider);
    expect(factory.getProvider(NotificationChannel.WEBHOOK)).toBe(webhookProvider);
    expect(factory.getProvider(NotificationChannel.SMS)).toBe(smsProvider);
  });
});
