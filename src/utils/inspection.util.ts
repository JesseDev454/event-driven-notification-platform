import { NotificationChannel } from '../types/notification';

export const toSafeNotificationTarget = (
  channel: NotificationChannel,
  target: string
): string => {
  switch (channel) {
    case NotificationChannel.EMAIL: {
      const [localPart, domain] = target.split('@');

      if (!domain) {
        return target;
      }

      const safeLocal =
        localPart.length <= 1 ? '*' : `${localPart[0]}${'*'.repeat(Math.max(1, localPart.length - 1))}`;

      return `${safeLocal}@${domain}`;
    }

    case NotificationChannel.SMS: {
      const visibleDigits = target.slice(-4);
      const maskedLength = Math.max(0, target.length - visibleDigits.length);

      return `${'*'.repeat(maskedLength)}${visibleDigits}`;
    }

    case NotificationChannel.WEBHOOK: {
      try {
        const url = new URL(target);

        return `${url.origin}${url.pathname}`;
      } catch (_error) {
        return target;
      }
    }
  }
};

export const toSafeSummary = (
  value: string | null,
  maxLength = 256
): string | null => {
  if (!value) {
    return null;
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
};
