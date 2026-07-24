# Shared Understanding — Phase 2 live evidence (after)

Captured from live :3020. Projected from durable state (Product Definition + Capability + Package + mission store); reuses Phase-1 selectFrontier/attemptCounsel (one source of truth). No transcript input.

## Access & Roles
- **Intent:** Access & Roles — V2 proposal
- **Relying on:**
  - [Settled] Roles are the unit of permission grant; users receive capability access via roles, never directly. — _Governable at scale; a role is the auditable unit._
  - [Settled] Permission taxonomy is capability-scoped (one permission set per capability). — _Keeps permissions legible and mappable to what a capability actually exposes._
  - [Must] Permission checks must be evaluable without a network call to a third party.
  - [Must] Every permission change must be attributable to an actor.
  - [Approach] Roles compose from capability-scoped permission sets.
- **Still open:** _(nothing load-bearing)_
- **Knowingly carrying:**
  - [tradeoff] Role-mediated grants over Direct per-user grants
  - [accepted_imperfection] Role changes are not audited (no change history).
- **Director advises (not decided):** 4 acceptance criteria to confirm
- **Continuing from:** Rather than open another, I'd pick up the one that's still in progress.
- **Set aside (history):**
  - ~~Per-user direct permission grants (bypassing roles).~~ (revisit if A per-user exception model with its own audit surface is ever justified.)
  - ~~A single global admin flag instead of granular capability permissions.~~

## Communications
- **Intent:** Communications V2
- **Relying on:**
  - [You decided] All comms are logged and consented before send.
  - _(resting on limited evidence)_
- **Still open:**
  - [open] Confirm whether this extends existing work or is the first version. — _It won't block a first pass, but it's worth a beat._

## Scheduling
- **Intent:** Improve Scheduling
- **Relying on:**
  - [You decided] Scheduling operates on operating-day pills; enrollment is the materialization boundary.
  - _(resting on limited evidence)_
- **Still open:** _(nothing load-bearing)_

## Financials
- **Intent:** Redesign Financials
- **Relying on:**
  - [You decided] Financials reconcile against the ledger; no direct balance writes.
  - _(resting on limited evidence)_
- **Still open:** _(nothing load-bearing)_
- **Knowingly carrying:**
  - [risk] This touches the ledger and rests on thin support — worth firming before acting.

## Reporting
- **Intent:** Improve Reporting
- **Relying on:**
  - [You decided] Reporting reads only from committed records; it never computes financial figures itself.
  - _(resting on limited evidence)_
- **Still open:** _(nothing load-bearing)_

## Onboarding
- **Intent:** Improve Onboarding
- **Relying on:**
  - [You decided] Onboarding is a guided checklist, not a wizard; each step is independently resumable.
  - _(resting on limited evidence)_
- **Still open:** _(nothing load-bearing)_

## Retention
- **Intent:** Improve Retention
- **Relying on:** _(nothing settled)_
- **Still open:**
  - [needs a decision] Record the decisions, goals, or constraints that shape this capability. — _Director doesn't yet have the product decisions this work depends on._

