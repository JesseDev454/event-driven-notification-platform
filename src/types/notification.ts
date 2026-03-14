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
  RETRYING = 'retrying',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed'
}

export enum DeliveryAttemptOutcome {
  SUCCESS = 'success',
  FAILURE = 'failure'
}

export enum DeliveryFailureCategory {
  NETWORK_ERROR = 'network_error',
  PROVIDER_TEMPORARY_FAILURE = 'provider_temporary_failure',
  INVALID_DESTINATION = 'invalid_destination',
  AUTHORIZATION_FAILURE = 'authorization_failure',
  MALFORMED_REQUEST = 'malformed_request',
  INTERNAL_ERROR = 'internal_error',
  UNKNOWN_FAILURE = 'unknown_failure'
}
