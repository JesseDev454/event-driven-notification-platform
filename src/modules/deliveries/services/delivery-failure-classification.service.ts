import { NotificationProviderResult } from '../../../providers/interfaces/notification-provider.interface';
import { DeliveryFailureCategory } from '../../../types/notification';

export interface DeliveryFailureClassification {
  category: DeliveryFailureCategory;
  retryable: boolean;
}

export class DeliveryFailureClassificationService {
  classify(result: NotificationProviderResult): DeliveryFailureClassification {
    const category = this.normalizeCategory(result.failureCategory);

    return {
      category,
      retryable: this.isRetryable(category)
    };
  }

  private normalizeCategory(rawCategory?: string | null): DeliveryFailureCategory {
    switch (rawCategory) {
      case DeliveryFailureCategory.NETWORK_ERROR:
        return DeliveryFailureCategory.NETWORK_ERROR;
      case 'provider_http_error':
      case DeliveryFailureCategory.PROVIDER_TEMPORARY_FAILURE:
        return DeliveryFailureCategory.PROVIDER_TEMPORARY_FAILURE;
      case DeliveryFailureCategory.INVALID_DESTINATION:
        return DeliveryFailureCategory.INVALID_DESTINATION;
      case DeliveryFailureCategory.AUTHORIZATION_FAILURE:
        return DeliveryFailureCategory.AUTHORIZATION_FAILURE;
      case 'downstream_request_error':
      case DeliveryFailureCategory.MALFORMED_REQUEST:
        return DeliveryFailureCategory.MALFORMED_REQUEST;
      case 'provider_execution_error':
      case DeliveryFailureCategory.INTERNAL_ERROR:
        return DeliveryFailureCategory.INTERNAL_ERROR;
      case DeliveryFailureCategory.UNKNOWN_FAILURE:
      default:
        return DeliveryFailureCategory.UNKNOWN_FAILURE;
    }
  }

  private isRetryable(category: DeliveryFailureCategory): boolean {
    switch (category) {
      case DeliveryFailureCategory.INVALID_DESTINATION:
      case DeliveryFailureCategory.AUTHORIZATION_FAILURE:
      case DeliveryFailureCategory.MALFORMED_REQUEST:
        return false;
      case DeliveryFailureCategory.NETWORK_ERROR:
      case DeliveryFailureCategory.PROVIDER_TEMPORARY_FAILURE:
      case DeliveryFailureCategory.INTERNAL_ERROR:
      case DeliveryFailureCategory.UNKNOWN_FAILURE:
      default:
        return true;
    }
  }
}
