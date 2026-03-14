export enum NotificationChannel {
  EMAIL = 'email',
  WEBHOOK = 'webhook',
  SMS = 'sms'
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

export enum DeliveryStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed'
}

export enum DeliveryAttemptOutcome {
  SUCCESS = 'success',
  FAILURE = 'failure'
}
