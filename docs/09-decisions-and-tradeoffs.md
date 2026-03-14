# Event-Driven Notification Platform

## Phase 8 Decisions and Tradeoffs

**Document status:** Draft  
**Phase:** Phase 8 - Decisions and Tradeoffs  
**Primary audience:** Backend engineers, architects, reviewers, and implementation planners  
**Purpose:** Consolidate the major decisions already defined across the prior design documents and make their rationale and tradeoffs explicit.

**Relationship to prior documents:** This document summarizes the major choices already implied or defined in `docs/01-project-overview.md` through `docs/08-testing-strategy.md`. It is a decision record, not a replacement for those documents.  
**Important note:** This document is intentionally implementation-free. It focuses on design choices and their consequences, not code structure or framework wiring.

## 1. Document Purpose

This document consolidates the major architectural, product, data-model, API, async-processing, security, and testing decisions that have already emerged across the earlier design set. Its purpose is to make those decisions easier to review, implement against, and revisit later if the platform evolves.

Rather than repeating the full content of each earlier document, this record captures the key choice, why it was made, and what cost or limitation it introduces.

## 2. How to Read This Document

This document should be read as a focused design record:

- it captures decisions, not implementation code details
- it explains why a choice was made, not just what the choice is
- it highlights tradeoffs so implementation teams understand the consequences of each choice
- it identifies open decisions intentionally deferred to later phases

The earlier documents remain the source for full context. This document is the short-form synthesis of those choices.

## 3. Decision Summary Table

| Decision ID | Area | Decision Summary |
| --- | --- | --- |
| D-01 | Architecture | Use an asynchronous API plus queue plus worker model. |
| D-02 | Architecture | Treat PostgreSQL as the durable source of truth and Redis / BullMQ as the execution mechanism. |
| D-03 | Async Processing | Start with event-level jobs before introducing per-delivery jobs. |
| D-04 | Architecture | Use provider abstraction for email, webhook, and mocked SMS delivery. |
| D-05 | Processing Semantics | Tolerate at-least-once processing rather than targeting exactly-once guarantees. |
| D-06 | Data Model | Treat `Event` as the canonical accepted record. |
| D-07 | Data Model | Keep `Delivery` separate from `Delivery Attempt`. |
| D-08 | Data Model | Preserve delivery-time snapshots rather than relying only on live subscription state. |
| D-09 | Data / Product | Prefer subscription deactivation over hard deletion. |
| D-10 | Data Model | Do not model the queue as durable relational truth. |
| D-11 | API Contract | Return `201 Created` for accepted event creation. |
| D-12 | API Contract | Separate producer ingestion APIs from admin/internal management and inspection APIs. |
| D-13 | API Contract | Use `PATCH` for subscription lifecycle and mutable-field changes. |
| D-14 | API Contract | Use consistent response envelopes across API groups. |
| D-15 | API Contract | Keep the HTTP contract implementation-independent. |
| D-16 | Security | Use a trusted producer model rather than anonymous public ingestion. |
| D-17 | Security | Sign outbound webhook deliveries. |
| D-18 | Security | Validate input at trust boundaries rather than relying only on deep internal checks. |
| D-19 | Security | Preserve role and scope separation between producer, admin, and worker access. |
| D-20 | Security / Operations | Prefer safe summaries over raw detail in normal operational surfaces. |
| D-21 | Testing | Use layered testing rather than relying only on end-to-end testing. |
| D-22 | Testing | Treat async and retry scenarios as first-class test concerns. |
| D-23 | Testing | Map tests back to earlier requirements and acceptance criteria. |

## 4. Architectural Decisions

### D-01 Asynchronous API + Queue + Worker Model

The platform uses a separated ingestion and background-processing model so producer-facing responsiveness is not tied to notification delivery latency or provider instability.

### D-02 Database as Durable Source of Truth

PostgreSQL is treated as the authoritative record for events, subscriptions, deliveries, attempts, and final outcomes. Redis / BullMQ supports execution and scheduling, but not durable business truth.

### D-03 Event-Level Jobs First

The initial async model begins with one event-processing job per accepted event. This keeps the first worker model easier to reason about while preserving a path to later per-delivery jobs.

### D-04 Provider Abstraction

Delivery is isolated behind provider adapters so email, webhook, and mocked SMS can participate in a shared workflow without embedding channel-specific behavior throughout the application.

### D-05 At-Least-Once Processing Tolerance

The platform accepts that queue-backed processing may result in duplicate or repeated execution and is designed to tolerate that reality instead of claiming exactly-once guarantees.

## 5. Data Model Decisions

### D-06 Event as Canonical Accepted Record

An accepted event becomes a durable root record in the system and remains the canonical source for what was submitted and accepted.

### D-07 Delivery Separate from Delivery Attempt

The current state of a notification is modeled separately from the historical attempt log so the system can support both operational status inspection and detailed retry history.

### D-08 Delivery-Time Snapshots

Delivery records preserve channel and destination context at creation time so later subscription edits do not distort historical truth.

### D-09 Subscription Deactivation Over Deletion

Subscription lifecycle changes are modeled through activation state rather than hard deletion, preserving clearer operational history and avoiding accidental loss of routing context.

### D-10 Queue Not Modeled as Durable Relational Truth

The relational model stores business state. Queue jobs remain transient runtime artifacts rather than becoming core durable entities in the database design.

## 6. API Contract Decisions

### D-11 `201 Created` for Accepted Event Resource Creation

`POST /events` returns `201 Created` because success means the platform has durably created an accepted event resource, even though notification delivery continues asynchronously.

### D-12 Producer vs Admin/Internal API Separation

The API surface is divided between producer ingestion and administrative inspection/configuration so trust, authorization, and contract expectations remain clearer.

### D-13 `PATCH`-Based Subscription Lifecycle Changes

Subscriptions are updated through partial update semantics, including activation and deactivation, rather than through delete-and-recreate flows for normal lifecycle changes.

### D-14 Consistent Response Envelopes

The API uses consistent success and error envelope conventions so contract behavior is easier to reason about and verify across endpoints.

### D-15 Implementation-Independent Contract Design

The API contract is defined in terms of resource behavior and HTTP semantics rather than controller names, ORM models, or framework-specific structures.

## 7. Security and Trust Decisions

### D-16 Trusted Producer Model

The platform is designed for authenticated producer systems, not anonymous public event submission.

### D-17 Signed Outbound Webhooks

Webhook deliveries should include authenticity signals so subscriber systems can verify that requests originated from the platform.

### D-18 Boundary Validation

Validation is expected at producer, admin, and provider-facing trust boundaries rather than deferred until deep inside the system.

### D-19 Role / Scope Separation

Producer submission, admin inspection, admin configuration, and worker execution are treated as distinct trust scopes even if some implementations initially group them together.

### D-20 Safe Summaries Over Raw Detail

Operational APIs and logs should favor safe, normalized summaries over indiscriminate exposure of raw provider, destination, or secret-adjacent data.

## 8. Testing Strategy Decisions

### D-21 Layered Testing Instead of Only End-to-End Tests

The platform will use unit, integration, contract, async-flow, provider-adapter, security-oriented, and exploratory testing rather than relying on one broad testing style.

### D-22 Async Scenario Coverage as a First-Class Concern

Worker execution, retries, interruptions, duplicate-work tolerance, and fanout scenarios are treated as explicit quality risks that deserve targeted coverage.

### D-23 Traceability from Tests Back to Requirements

Testing is expected to map back to earlier requirements and acceptance criteria so quality work stays anchored to documented behavior.

## 9. Tradeoff Discussion

| Decision ID | Why It Was Chosen | Downside / Cost | Alternative Not Chosen |
| --- | --- | --- | --- |
| D-01 | Keeps ingestion responsive and isolates provider latency from clients | Adds eventual-consistency and queue coordination complexity | Synchronous notification delivery in the request path |
| D-02 | Preserves durable auditability and stable business truth | Requires explicit coordination between stored state and queued work | Treating queue state as the main system record |
| D-03 | Keeps the first worker model understandable and aligned with the current scope | Large fanout events may make a single job heavier than ideal | Starting immediately with per-delivery jobs |
| D-04 | Improves maintainability and future extensibility across channels | Introduces another abstraction boundary to design and test | Embedding channel logic directly in workflows or controllers |
| D-05 | Reflects realistic queue-backed processing semantics and reduces false precision | Requires duplicate-tolerant design and careful retry thinking | Exactly-once delivery guarantees |
| D-06 | Gives the system a canonical durable root record for accepted work | Adds durable-state coordination before async scheduling | Treating queued payloads as the primary accepted record |
| D-07 | Preserves both current delivery state and historical attempt visibility | Increases model complexity and state-management work | Storing only a single mutable delivery record |
| D-08 | Protects historical truth when subscriptions change later | Requires additional snapshot fields on deliveries | Looking up only current subscription state during historical inspection |
| D-09 | Preserves operational history and reduces accidental loss of configuration context | Requires lifecycle-state handling instead of simple deletion semantics | Hard delete as the primary lifecycle control |
| D-11 | Matches the durable-acceptance model expressed in the API contract | May feel counterintuitive to teams that associate async work with `202 Accepted` | Returning `202 Accepted` for event ingestion |
| D-12 | Clarifies trust, roles, and use cases across the API surface | Adds more explicit endpoint-group and scope management | A single undifferentiated API surface for all callers |
| D-13 | Supports controlled lifecycle changes without implying resource destruction | Requires clearer partial-update rules and validation behavior | Using delete semantics or full replacement for lifecycle changes |
| D-14 | Makes client and test behavior more predictable | Adds some envelope verbosity to simple responses | Inconsistent resource-specific response shapes |
| D-16 | Matches the intended internal-platform use case and reduces anonymous exposure | Requires an authentication strategy even for early development | Public anonymous ingestion |
| D-17 | Gives subscribers a practical authenticity model for webhook trust | Requires secret distribution and later lifecycle management | Unsigned outbound webhooks |
| D-18 | Stops bad input earlier and improves error clarity | Requires validation rules at multiple boundaries | Relying mostly on deep internal validation |
| D-19 | Supports least privilege and cleaner trust boundaries | Introduces role or scope design complexity | Treating all authenticated actors as equivalent |
| D-20 | Reduces risk of accidental disclosure through APIs and logs | Can limit debugging detail in standard operator flows | Exposing raw provider and destination detail broadly |
| D-21 | Matches the platform's multi-boundary risks more realistically | Requires more test planning and maintenance discipline | Mostly end-to-end testing with minimal lower-layer coverage |
| D-22 | Focuses testing effort on one of the system's highest-risk areas | Async tests are slower and can be harder to keep deterministic | Treating async behavior as covered indirectly by basic integration tests |
| D-23 | Keeps testing aligned to documented behavior and acceptance expectations | Requires explicit mapping discipline in the test plan | Ad hoc test coverage without requirement traceability |

## 10. Deferred or Open Decisions

The following decisions are intentionally left open for later phases:

| Open Decision | Why It Is Deferred |
| --- | --- |
| Producer authentication mechanism | The platform requires trusted producer identity, but the exact mechanism can be chosen later to fit the implementation environment. |
| Idempotency key design for `POST /events` | Duplicate-submission concerns are recognized, but the exact policy and contract shape remain open. |
| Subscription uniqueness policy | The system may later prevent exact duplicate active subscriptions, but that rule depends on product policy. |
| Webhook secret ownership and lifecycle model | Shared-secret authenticity is required, but secret generation, rotation, and administrative ownership details are deferred. |
| API versioning formalization | The contract is defined, but versioning mechanics can be introduced once the surface stabilizes further. |
| Timing for per-delivery jobs | The architecture preserves a path to finer-grained async jobs, but the initial system starts with event-level jobs. |
| Redaction granularity for admin visibility | Safe summaries are preferred, but exact role-based field exposure remains future work. |
| Replay and recovery operations | Replay tooling is anticipated, but explicit administrative replay contracts are not yet part of the current scope. |

## 11. Guidance for Implementation

Developers should use this document as a short-form decision baseline during implementation and review.

- If an implementation choice aligns with these decisions, the document can serve as confirmation that the behavior is intentional.
- If a code change appears to violate one of these decisions, reviewers should treat that as a design discussion, not just a coding detail.
- If the team intentionally changes one of these decisions later, this document and the underlying source document should be updated together.
- This document should be used alongside the earlier docs, not instead of them.

