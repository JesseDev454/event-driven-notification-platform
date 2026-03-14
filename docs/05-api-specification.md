# Event-Driven Notification Platform

## Phase 4 API Specification

**Document status:** Draft  
**Phase:** Phase 4 - API Specification  
**Primary audience:** Backend engineers, architects, API designers, and technical reviewers  
**Purpose:** Define the external producer-facing and internal administrative HTTP API contracts before implementation begins.

**Relationship to prior documents:** This document builds on `docs/01-project-overview.md`, `docs/02-user-stories-and-requirements.md`, `docs/03-architecture-and-components.md`, and `docs/04-database-design.md`. It translates approved requirements and architecture into clear HTTP resource contracts without yet generating controller code, validation-library rules, or machine-readable OpenAPI definitions.  
**Important note:** This document is intentionally implementation-free. It defines contract behavior, not framework wiring or code.

## 1. Document Purpose

This document defines the API contract for two primary categories of platform interaction:

- producer ingestion of business events
- administrative and internal inspection or management of subscriptions, events, deliveries, and delivery attempts

Its purpose is to establish clear HTTP behavior before implementation begins. That includes endpoint structure, request and response shapes, status code usage, validation expectations, authentication assumptions, and error semantics. The goal is to make the contract precise enough that implementation can follow from it while remaining independent of any specific controller framework, routing library, or validation package.

## 2. API Design Principles

The API should follow these design principles:

- **Clear resource-oriented endpoints:** Endpoints should model stable resources such as events, subscriptions, deliveries, and delivery attempts rather than exposing transport-centric or worker-internal concepts.
- **Durable acceptance before asynchronous processing:** Successful event ingestion responses should reflect that an `Event` resource has been durably accepted before background delivery processing begins.
- **Consistent response formats:** Success and error responses should follow stable, predictable shapes across endpoint groups.
- **Separation between producer APIs and admin/internal APIs:** Producer-facing ingestion concerns should remain distinct from operational inspection and administrative management concerns, even when they are hosted within the same service.
- **Implementation-independent contract design:** The HTTP contract should not depend on controller naming, ORM structure, or internal storage terminology.
- **Stable field naming:** JSON request and response bodies should use consistent contract-level naming that is independent from persistence-layer attribute naming.
- **Traceability by contract:** The API should expose identifiers and correlation references that help operators and client systems follow work across ingestion and asynchronous processing.

## 3. Authentication and Access Assumptions

The exact authentication and authorization mechanism will be finalized later, but the API contract assumes clear separation of access responsibilities.

### Producer Authentication Assumptions

- `POST /events` is intended for trusted producer systems.
- Producers must be authenticated before the platform accepts an event.
- Producer identity may be derived from service credentials, internal identity, API keys, or another controlled mechanism chosen later.
- Authentication context is treated as part of event acceptance, not as optional metadata.

### Administrative and Internal Access Assumptions

- Event inspection, subscription management, and delivery-monitoring endpoints are intended for platform administrators or internal systems with operational scope.
- Administrative endpoints require stronger or broader authorization than producer ingestion.
- Read-only inspection access and configuration-changing access may later be separated into distinct roles.

### Contract Note

- This document defines which categories of access are required for each endpoint.
- It does not finalize the exact authentication protocol, token format, or identity provider.

## 4. API Surface Overview

| API Group | Endpoint | Access Scope | Purpose |
| --- | --- | --- | --- |
| Event Ingestion APIs | `POST /events` | Producer | Accept and durably record a new event for asynchronous processing. |
| Event Inspection APIs | `GET /events` | Admin/Internal | List accepted events for inspection, tracing, and operational review. |
| Event Inspection APIs | `GET /events/{eventId}` | Admin/Internal | Retrieve a single accepted event and its current high-level processing summary. |
| Subscription Management APIs | `POST /subscriptions` | Admin/Internal | Create a new subscription for an event type and channel. |
| Subscription Management APIs | `GET /subscriptions` | Admin/Internal | List subscriptions with filtering by event type, channel, and status. |
| Subscription Management APIs | `GET /subscriptions/{subscriptionId}` | Admin/Internal | Retrieve a single subscription record. |
| Subscription Management APIs | `PATCH /subscriptions/{subscriptionId}` | Admin/Internal | Update mutable subscription fields, including activation state. |
| Delivery Monitoring APIs | `GET /deliveries` | Admin/Internal | List deliveries for operational monitoring and troubleshooting. |
| Delivery Monitoring APIs | `GET /deliveries/{deliveryId}` | Admin/Internal | Retrieve a single delivery and its current state. |
| Delivery Monitoring APIs | `GET /deliveries/{deliveryId}/attempts` | Admin/Internal | Retrieve the historical attempts for a single delivery. |
| Delivery Monitoring APIs | `GET /events/{eventId}/deliveries` | Admin/Internal | Retrieve all deliveries created from a specific accepted event. |

### Contract Scope Note

- The initial contract does not include a hard-delete subscription endpoint.
- Subscription deactivation is handled through update semantics so historical routing context remains understandable.
- The initial contract does not include retry, replay, or bulk-operation endpoints; those remain future evolution items.

## 5. Event Ingestion API

### `POST /events`

**Purpose:** Accept a new event from a trusted producer, validate the contract, durably create an `Event` record, and trigger asynchronous processing.

**Access scope:** Producer

**Request body shape**

| Field | Required | Description |
| --- | --- | --- |
| `event` | Yes | Event type name, such as `order.created`. |
| `data` | Yes | Event-specific business payload as a JSON object. |
| `userId` | No | Business identifier associated with the event when relevant to the producing domain. |
| `correlationId` | No | Caller-supplied tracing identifier used to link related operations. |
| `occurredAt` | No | Timestamp representing when the event occurred in the producer domain. |
| `metadata` | No | Additional non-authoritative event metadata relevant to routing, diagnostics, or future review. |

**Required field expectations**

- `event` must be a non-empty string following the platform's event-naming convention.
- `data` must be a JSON object.

**Optional field expectations**

- `userId`, when present, must be a non-empty string.
- `correlationId`, when present, must be a non-empty string.
- `occurredAt`, when present, must be a valid timestamp.
- `metadata`, when present, must be a JSON object.

**Response behavior**

- A successful response indicates that the event has been durably accepted as an `Event` resource.
- The response does not imply that any deliveries have already succeeded.
- Background processing continues asynchronously after acceptance.

**Primary success response**

- `201 Created`

**Response body shape**

| Field | Description |
| --- | --- |
| `data.eventId` | Platform-generated identifier for the accepted event. |
| `data.event` | Accepted event type. |
| `data.processingStatus` | Initial high-level processing state, such as `accepted` or `queued`. |
| `data.correlationId` | Effective correlation reference for the event lifecycle. |
| `data.acceptedAt` | Timestamp at which durable acceptance occurred. |
| `data.links.self` | Canonical inspection link for the event resource. |
| `meta.requestId` | Request-scoped diagnostic identifier. |

**Status codes**

| Status | Meaning |
| --- | --- |
| `201 Created` | Event was validated, durably accepted, and scheduled for asynchronous processing. |
| `400 Bad Request` | Request body or JSON structure is malformed. |
| `401 Unauthorized` | Producer authentication is missing or invalid. |
| `403 Forbidden` | Caller is authenticated but not allowed to submit events. |
| `422 Unprocessable Entity` | Request is well-formed JSON but violates contract rules, such as missing required business fields or unsupported event naming. |
| `500 Internal Server Error` | Unexpected server-side failure occurred. |

**Validation rules**

- The request body must be a JSON object.
- The API must validate top-level contract fields before accepting the event.
- The `data` field is intentionally flexible, but it must remain a JSON object.
- Unknown top-level fields should be rejected to keep the public contract explicit.
- The platform may validate event naming rules and basic timestamp sanity at the boundary.

**Example request**

```http
POST /events
Content-Type: application/json

{
  "event": "order.created",
  "userId": "123",
  "correlationId": "corr-order-555",
  "occurredAt": "2026-03-13T10:15:00Z",
  "data": {
    "orderId": "ORD-555",
    "amount": 250
  },
  "metadata": {
    "source": "orders-service"
  }
}
```

**Example response**

```json
{
  "data": {
    "eventId": "evt_01HXYZ123",
    "event": "order.created",
    "processingStatus": "accepted",
    "correlationId": "corr-order-555",
    "acceptedAt": "2026-03-13T10:15:01Z",
    "links": {
      "self": "/events/evt_01HXYZ123"
    }
  },
  "meta": {
    "requestId": "req_01HXYZ999"
  }
}
```

### `GET /events`

**Purpose:** List accepted events for administrative inspection, troubleshooting, and traceability.

**Access scope:** Admin/Internal

**Query parameters**

| Parameter | Description |
| --- | --- |
| `event` | Filter by event type. |
| `processingStatus` | Filter by current high-level event processing state. |
| `correlationId` | Filter by correlation reference. |
| `producerReference` | Filter by producer or source identity when available in the stored record. |
| `acceptedFrom` | Lower bound for event acceptance time. |
| `acceptedTo` | Upper bound for event acceptance time. |
| `limit` | Page size limit. |
| `cursor` | Opaque cursor for paginated traversal. |
| `sort` | Sort expression, typically by acceptance or update time. |

**Response structure**

- Returns a collection of event summaries.
- Each item should include identifiers, event type, high-level processing status, correlation reference, and relevant timestamps.
- Collection responses should include pagination metadata.

**Status codes**

| Status | Meaning |
| --- | --- |
| `200 OK` | Event collection returned successfully. |
| `400 Bad Request` | Query parameters are malformed or mutually invalid. |
| `401 Unauthorized` | Authentication is missing or invalid. |
| `403 Forbidden` | Caller lacks inspection scope. |
| `500 Internal Server Error` | Unexpected server-side failure occurred. |

### `GET /events/{eventId}`

**Purpose:** Retrieve a single event resource and its current high-level processing summary.

**Access scope:** Admin/Internal

**Response structure**

| Field | Description |
| --- | --- |
| `data.eventId` | Event identifier. |
| `data.event` | Event type. |
| `data.processingStatus` | High-level processing summary. |
| `data.correlationId` | Correlation reference. |
| `data.payload` | Accepted event payload. |
| `data.acceptedAt` | Durable acceptance timestamp. |
| `data.queuedAt` | Timestamp when asynchronous processing was scheduled, if available. |
| `data.lastProcessedAt` | Most recent processing progression timestamp, if available. |
| `data.links.deliveries` | Link to deliveries derived from the event. |

**Status codes**

| Status | Meaning |
| --- | --- |
| `200 OK` | Event returned successfully. |
| `401 Unauthorized` | Authentication is missing or invalid. |
| `403 Forbidden` | Caller lacks inspection scope. |
| `404 Not Found` | No accepted event exists for the supplied identifier. |
| `500 Internal Server Error` | Unexpected server-side failure occurred. |

## 6. Subscription Management APIs

### Subscription Design Note

- Subscriptions are durable administrative configuration.
- The initial contract favors deactivation over hard deletion.
- `event` and `channel` are treated as creation-time contract fields and are not mutable through the initial update contract.

### `POST /subscriptions`

**Purpose:** Create a new subscription that maps an event type to a delivery channel and destination.

**Access scope:** Admin/Internal

**Request body shape**

| Field | Required | Description |
| --- | --- | --- |
| `event` | Yes | Event type the subscription listens for. |
| `channel` | Yes | Delivery channel, such as `email`, `webhook`, or `sms`. |
| `target` | Yes | Channel-specific destination information. |
| `status` | No | Initial subscription state; defaults to `active`. |
| `deliverySettings` | No | Optional channel-specific settings or routing options. |
| `managedReference` | No | Optional administrative label or ownership reference. |

**Target expectations by channel**

- For `email`, the target should contain an email-oriented destination field.
- For `webhook`, the target should contain a webhook URL or equivalent endpoint reference.
- For `sms`, the target should contain the mocked SMS destination value expected by the platform.

**Response structure**

- Returns the created subscription resource.
- The response includes identifier, event type, channel, status, target summary, delivery settings, and timestamps.

**Validation considerations**

- `event` must satisfy event-naming rules.
- `channel` must be one of the supported platform channels.
- `target` must contain the required destination form for the selected channel.
- `status`, if supplied, must be a valid subscription lifecycle value.

**Status codes**

| Status | Meaning |
| --- | --- |
| `201 Created` | Subscription created successfully. |
| `400 Bad Request` | Request body is malformed. |
| `401 Unauthorized` | Authentication is missing or invalid. |
| `403 Forbidden` | Caller lacks configuration scope. |
| `409 Conflict` | Request conflicts with a uniqueness or state rule, such as a duplicate active subscription if such a rule is enforced. |
| `422 Unprocessable Entity` | Request is well-formed but semantically invalid for the chosen channel or business rules. |
| `500 Internal Server Error` | Unexpected server-side failure occurred. |

### `GET /subscriptions`

**Purpose:** List subscriptions for review and administrative filtering.

**Access scope:** Admin/Internal

**Query parameters**

| Parameter | Description |
| --- | --- |
| `event` | Filter by event type. |
| `channel` | Filter by delivery channel. |
| `status` | Filter by active or inactive state. |
| `managedReference` | Filter by administrative ownership or label. |
| `limit` | Page size limit. |
| `cursor` | Opaque cursor for paginated traversal. |
| `sort` | Sort expression, typically by creation or update time. |

**Response structure**

- Returns a collection of subscription summaries.
- Each item should include identifier, event type, channel, status, destination summary, and timestamps.

**Status codes**

| Status | Meaning |
| --- | --- |
| `200 OK` | Subscription collection returned successfully. |
| `400 Bad Request` | Query parameters are malformed or mutually invalid. |
| `401 Unauthorized` | Authentication is missing or invalid. |
| `403 Forbidden` | Caller lacks inspection scope. |
| `500 Internal Server Error` | Unexpected server-side failure occurred. |

### `GET /subscriptions/{subscriptionId}`

**Purpose:** Retrieve a single subscription resource.

**Access scope:** Admin/Internal

**Response structure**

| Field | Description |
| --- | --- |
| `data.subscriptionId` | Subscription identifier. |
| `data.event` | Event type the subscription matches. |
| `data.channel` | Delivery channel. |
| `data.target` | Channel-appropriate destination object or safe administrative representation of it. |
| `data.status` | Current subscription lifecycle state. |
| `data.deliverySettings` | Current optional delivery settings. |
| `data.managedReference` | Administrative label or ownership reference, if present. |
| `data.createdAt` | Creation timestamp. |
| `data.updatedAt` | Most recent update timestamp. |
| `data.deactivatedAt` | Deactivation timestamp, if inactive. |

**Status codes**

| Status | Meaning |
| --- | --- |
| `200 OK` | Subscription returned successfully. |
| `401 Unauthorized` | Authentication is missing or invalid. |
| `403 Forbidden` | Caller lacks inspection scope. |
| `404 Not Found` | No subscription exists for the supplied identifier. |
| `500 Internal Server Error` | Unexpected server-side failure occurred. |

### `PATCH /subscriptions/{subscriptionId}`

**Purpose:** Update mutable subscription fields, including activation state.

**Access scope:** Admin/Internal

**Allowed updates**

| Field | Allowed | Notes |
| --- | --- | --- |
| `status` | Yes | Supports transitions such as `active` to `inactive` and `inactive` to `active`. |
| `target` | Yes | Allows destination changes for future deliveries. |
| `deliverySettings` | Yes | Allows revision of channel-specific or routing-specific settings. |
| `managedReference` | Yes | Allows operational ownership or labeling updates. |
| `event` | No | Create a new subscription if event type must change. |
| `channel` | No | Create a new subscription if channel must change. |

**Response structure**

- Returns the updated subscription resource.
- Historical deliveries remain unaffected by updates because they preserve delivery-time routing context independently.

**Validation considerations**

- Only mutable fields may be supplied.
- Target updates must remain valid for the subscription's existing channel.
- Invalid lifecycle transitions should be rejected rather than silently coerced.

**Deactivation behavior**

- The preferred way to stop future matching is `PATCH` with `"status": "inactive"`.
- Hard delete is not part of the initial contract.

**Status codes**

| Status | Meaning |
| --- | --- |
| `200 OK` | Subscription updated successfully. |
| `400 Bad Request` | Request body is malformed. |
| `401 Unauthorized` | Authentication is missing or invalid. |
| `403 Forbidden` | Caller lacks configuration scope. |
| `404 Not Found` | No subscription exists for the supplied identifier. |
| `409 Conflict` | Requested change conflicts with lifecycle or uniqueness rules. |
| `422 Unprocessable Entity` | Request is well-formed but semantically invalid for the existing subscription. |
| `500 Internal Server Error` | Unexpected server-side failure occurred. |

## 7. Delivery Monitoring APIs

### `GET /deliveries`

**Purpose:** List deliveries for monitoring, failure review, and operational filtering.

**Access scope:** Admin/Internal

**Query parameters**

| Parameter | Description |
| --- | --- |
| `eventId` | Filter by originating event. |
| `subscriptionId` | Filter by originating subscription. |
| `status` | Filter by delivery state, such as `pending`, `retrying`, `succeeded`, or `terminally_failed`. |
| `channel` | Filter by delivery channel. |
| `correlationId` | Filter by correlation reference. |
| `createdFrom` | Lower bound for delivery creation time. |
| `createdTo` | Upper bound for delivery creation time. |
| `updatedFrom` | Lower bound for last-update time. |
| `updatedTo` | Upper bound for last-update time. |
| `limit` | Page size limit. |
| `cursor` | Opaque cursor for paginated traversal. |
| `sort` | Sort expression, typically by creation or update time. |

**Response structure**

- Returns a collection of delivery summaries.
- Each item should include identifiers, channel, current status, retry count, correlation reference, event reference, subscription reference, and key timestamps.

**Status codes**

| Status | Meaning |
| --- | --- |
| `200 OK` | Delivery collection returned successfully. |
| `400 Bad Request` | Query parameters are malformed or mutually invalid. |
| `401 Unauthorized` | Authentication is missing or invalid. |
| `403 Forbidden` | Caller lacks monitoring scope. |
| `500 Internal Server Error` | Unexpected server-side failure occurred. |

### `GET /deliveries/{deliveryId}`

**Purpose:** Retrieve the current state and summary details of a single delivery.

**Access scope:** Admin/Internal

**Response structure**

| Field | Description |
| --- | --- |
| `data.deliveryId` | Delivery identifier. |
| `data.eventId` | Originating event identifier. |
| `data.subscriptionId` | Originating subscription identifier. |
| `data.channel` | Delivery channel used at the time of creation. |
| `data.destination` | Delivery-time destination or safe administrative representation of it. |
| `data.status` | Current delivery state. |
| `data.retryCount` | Number of attempts already consumed. |
| `data.maxRetryLimit` | Configured retry cap for the delivery. |
| `data.nextRetryAt` | Scheduled retry time, if applicable. |
| `data.finalOutcomeCode` | High-level final or current outcome summary. |
| `data.lastErrorSummary` | Latest failure summary, if applicable. |
| `data.correlationId` | Correlation reference. |
| `data.createdAt` | Creation timestamp. |
| `data.updatedAt` | Most recent update timestamp. |
| `data.completedAt` | Final completion timestamp, if applicable. |
| `data.links.attempts` | Link to attempt history for the delivery. |

**Status codes**

| Status | Meaning |
| --- | --- |
| `200 OK` | Delivery returned successfully. |
| `401 Unauthorized` | Authentication is missing or invalid. |
| `403 Forbidden` | Caller lacks monitoring scope. |
| `404 Not Found` | No delivery exists for the supplied identifier. |
| `500 Internal Server Error` | Unexpected server-side failure occurred. |

### `GET /deliveries/{deliveryId}/attempts`

**Purpose:** Retrieve the historical attempts for a delivery in chronological lifecycle order.

**Access scope:** Admin/Internal

**Query parameters**

| Parameter | Description |
| --- | --- |
| `limit` | Page size limit when attempt history is large. |
| `cursor` | Opaque cursor for paginated traversal. |
| `sort` | Sort expression, typically by attempt time. |

**Response structure**

- Returns a collection of attempt records for the delivery.
- Each item should include attempt identifier, sequence number, provider reference, outcome, retryable flag, failure category, error summary, and timestamps.

**Status codes**

| Status | Meaning |
| --- | --- |
| `200 OK` | Delivery attempts returned successfully. |
| `401 Unauthorized` | Authentication is missing or invalid. |
| `403 Forbidden` | Caller lacks monitoring scope. |
| `404 Not Found` | No delivery exists for the supplied identifier. |
| `500 Internal Server Error` | Unexpected server-side failure occurred. |

### `GET /events/{eventId}/deliveries`

**Purpose:** Retrieve all deliveries created from a specific accepted event.

**Access scope:** Admin/Internal

**Query parameters**

| Parameter | Description |
| --- | --- |
| `status` | Optional filter by delivery status. |
| `channel` | Optional filter by delivery channel. |
| `limit` | Page size limit. |
| `cursor` | Opaque cursor for paginated traversal. |
| `sort` | Sort expression, typically by creation time. |

**Response structure**

- Returns deliveries scoped to the supplied event identifier.
- Enables event-to-delivery fanout inspection without requiring the caller to query the broader delivery collection.

**Status codes**

| Status | Meaning |
| --- | --- |
| `200 OK` | Event-scoped deliveries returned successfully. |
| `401 Unauthorized` | Authentication is missing or invalid. |
| `403 Forbidden` | Caller lacks monitoring scope. |
| `404 Not Found` | No event exists for the supplied identifier. |
| `500 Internal Server Error` | Unexpected server-side failure occurred. |

## 8. Response Format Conventions

The API should use consistent JSON response envelopes across resource groups.

### Success Response for a Single Resource

```json
{
  "data": {
    "id": "resource-specific-id"
  },
  "meta": {
    "requestId": "req_01HXYZ999"
  }
}
```

### Collection Response

```json
{
  "data": [
    {
      "id": "resource-specific-id"
    }
  ],
  "meta": {
    "requestId": "req_01HXYZ999",
    "pagination": {
      "limit": 50,
      "nextCursor": "opaque-cursor-value"
    },
    "filters": {
      "status": "retrying"
    },
    "sort": "-updatedAt"
  }
}
```

### Validation Error Response

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": [
      {
        "field": "event",
        "issue": "required"
      }
    ],
    "requestId": "req_01HXYZ999"
  }
}
```

### Not Found Response

```json
{
  "error": {
    "code": "not_found",
    "message": "The requested resource was not found.",
    "requestId": "req_01HXYZ999"
  }
}
```

### Unauthorized or Forbidden Response

```json
{
  "error": {
    "code": "forbidden",
    "message": "The caller does not have permission to access this resource.",
    "requestId": "req_01HXYZ999"
  }
}
```

### Envelope Conventions

- Successful responses use `data` and `meta`.
- Error responses use `error`.
- `requestId` should be available for all responses, either in the body, in headers, or in both.
- Resource-specific identifiers such as `eventId`, `subscriptionId`, and `deliveryId` should remain explicit in resource payloads rather than hidden in generic metadata.

## 9. Status Code Conventions

| Status Code | Usage in This Contract |
| --- | --- |
| `200 OK` | Successful reads and non-creation updates. |
| `201 Created` | Successful creation of durable resources such as accepted events and subscriptions. |
| `400 Bad Request` | Malformed JSON, invalid query parameter formatting, or structurally invalid requests. |
| `401 Unauthorized` | Missing or invalid authentication. |
| `403 Forbidden` | Authenticated caller lacks the required scope or role for the endpoint. |
| `404 Not Found` | Resource does not exist for the supplied identifier or scoped path. |
| `409 Conflict` | Request conflicts with a resource state or uniqueness rule, such as a conflicting subscription mutation. |
| `422 Unprocessable Entity` | Request is syntactically valid JSON but semantically invalid according to business or contract rules. |
| `500 Internal Server Error` | Unexpected server-side failure. |

### Status Code Design Note

- `POST /events` uses `201 Created` because the contract treats accepted events as durably created resources even though delivery processing continues asynchronously.
- The initial contract does not rely on `202 Accepted` for core event ingestion because durable resource creation is part of the success definition.

## 10. Validation and Error Model

### Request Validation Principles

- Validation should occur at the API boundary before a request is accepted as platform work.
- Validation should distinguish malformed requests from semantically invalid requests.
- Top-level contract fields should be explicit and predictable.
- Field validation should be consistent across creation and update operations.
- Channel-specific validation should apply where subscription targets or settings depend on the selected channel.

### Rejection Behavior

- Invalid event submissions must be rejected rather than partially accepted.
- Invalid subscription updates must be rejected rather than silently coerced into unexpected states.
- Invalid query parameters must produce clear client-visible error responses.

### Error Structure

The error model should provide:

- a stable machine-readable `code`
- a human-readable `message`
- optional `details` entries for field-level or parameter-level issues
- a `requestId` for diagnostics and support

### Example Error Codes

| Error Code | Intended Meaning |
| --- | --- |
| `validation_error` | Request body or query validation failed. |
| `unauthorized` | Authentication is missing or invalid. |
| `forbidden` | Caller lacks required access scope. |
| `not_found` | Resource does not exist. |
| `conflict` | Request conflicts with current resource state or uniqueness rules. |
| `unprocessable_entity` | Contract rules were violated despite valid JSON structure. |
| `internal_error` | Unexpected server-side failure occurred. |

### Correlation and Request IDs

- Each HTTP response should expose a request-scoped identifier for diagnostics.
- Event and delivery resources may also include business correlation identifiers when available.
- Request IDs and correlation IDs serve different purposes and should remain distinct in the contract.

## 11. Pagination, Filtering, and Sorting

List endpoints should support consistent query behavior so operational tooling and future UI surfaces can rely on predictable access patterns.

### Pagination

- List endpoints should support pagination using `limit` and `cursor`.
- `cursor` should be treated as opaque by clients.
- Collection responses should include pagination metadata and `nextCursor` when another page is available.
- The platform may define a default page size and a maximum permitted page size later.

### Filtering

- List endpoints should support resource-appropriate exact-match filters such as `event`, `status`, `channel`, `subscriptionId`, or `correlationId`.
- Event and delivery lists should support time-range filters using clearly named timestamp bounds.
- Filters should be additive when logically compatible.
- Mutually incompatible filters should be rejected clearly rather than interpreted ambiguously.

### Sorting

- List endpoints should support a `sort` parameter with a stable field-based contract.
- Default sort order should favor the most operationally recent records for inspection use cases.
- Supported sort fields should be limited to fields that are meaningful and stable for the resource, such as `acceptedAt`, `createdAt`, `updatedAt`, or `attemptedAt`.

### Time Range Queries

- Time filters should use a clear timestamp format and be interpreted consistently across endpoints.
- Invalid time ranges, such as an end time before a start time, should be rejected.
- Time range filters should be available where operational review commonly depends on recency.

## 12. Open Questions / Future API Evolution

The following areas may evolve in later phases:

- **Idempotency keys for `POST /events`:** The contract may later support producer-supplied idempotency keys to reduce accidental duplicate event acceptance.
- **Richer administrative queries:** Event, subscription, and delivery inspection may later support more advanced filter combinations and summary views.
- **Retry or replay endpoints:** Administrative operations for controlled retry or replay may be added later once delivery lifecycle policies are finalized.
- **Bulk subscription operations:** Administrative tooling may later need bulk activation, deactivation, or creation endpoints.
- **Webhook test or verification endpoints:** Later phases may introduce endpoints that help validate webhook configuration safely.
- **Versioning strategy formalization:** A versioned URI or equivalent compatibility policy may be introduced once the API surface stabilizes.
- **Redaction and field-level access controls:** Future security refinement may differentiate what destination detail is visible to different administrative roles.
