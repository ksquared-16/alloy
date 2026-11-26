---
owner: platform
status: canonical
last_reviewed: 2026-07-17
concept: configuration-platform-expansion
supersedes: []
---

# Configuration Platform Expansion Constitution

**Status:** Ratified Product Constitution  
**Date:** 2026-07-17  
**Kind:** Product architecture — not an engineering plan  
**Extends (does not reopen):** Configuration Runtime · Organization Runtime · Locations Runtime · Configuration Publication Runtime · Programs reference consumer · Assignment doctrine · `/organization/*` routing · Configuration visual language

> **Purpose.** Programs proved that Organization can publish immutable revisions and assign them to Locations without overwriting Location-owned operational truth. This constitution defines how every remaining Organization domain participates in that platform — what publishes, what inherits, what stays Organization-only, and what becomes Location-aware — without inventing new infrastructure.

---

## 0. Frozen premises (do not reopen)

1. Configuration steers; code owns invariants.
2. Organization is the publisher; Locations are consumers.
3. One system of record per object; all other surfaces reference it.
4. Publication, inheritance, assignment, and Apply are distinct.
5. Programs delivery is **assignment**, not Apply.
6. Location operational truth (capacity, staffing, rooms, schedules, placements, attendance, billing facts) remains local.
7. Canonical Organization hierarchy begins at `/organization/*`.
8. Collection and Detail grammar inherit Locations / Configuration Runtime visual language without becoming identical pages.

---

## 1. Domain classification

Every Organization domain is classified on six axes. A domain may hold multiple true axes; none may silently invent a seventh distribution mode.

| Axis | Meaning |
|---|---|
| **Organization-only** | Authored and consumed at Organization scope; Locations do not receive a Location-specific copy or availability toggle |
| **Publishable** | Uses draft → immutable published revision (Publication Runtime) |
| **Assignable** | A published (or live) definition may be made available or unavailable per Location / context without copying operational truth |
| **Location-consumed** | Locations (or Location runtimes) read Organization configuration as input |
| **Override-capable** | Explicit Controlled Difference is allowed for named fields only |
| **Effective-value resolved** | Runtime/server resolves published Organization value + permitted Location differences |

### Classification matrix

| Domain | Org-only | Publishable | Assignable | Location-consumed | Override-capable | Effective-value |
|---|---|---|---|---|---|---|
| **Programs** | — | ✓ proven | ✓ proven | ✓ | ✓ limited | ✓ |
| **Locations** | ✓ (membership/registry) | — | — | — | — | — |
| **Processes** | — | ○ future | ✓ | ✓ | ○ limited | ○ when published |
| **Operational Calculations** | — | ✓ next | ○ optional | ✓ | ✓ targets/thresholds | ✓ |
| **Fields** | ✓ definitions | — | — | ✓ (read) | — | org vocabulary |
| **Statuses** | ✓ catalog | — | — | ✓ (read) | — | org vocabulary |
| **Actions / Automation** | — | ○ future | ✓ enablement | ✓ | ○ params | ○ |
| **Communications** | — | ○ future | ✓ template availability | ✓ | ✓ content/signature | ✓ |
| **Access** | — | — | ✓ role/context assignment | ✓ | — | assignment resolve |
| **Surfaces** | — | ✓ presentation docs | — | ✓ | — | published surface |
| **Future domains** | by owner ratification | only when revision integrity is required | only when availability differs by Location | only when Local runtimes consume | only for named fields | only when override or inherit exists |

Legend: ✓ = ratified for platform expansion · ○ = eligible later · — = not in scope for that axis

### Domain notes

**Programs (complete).** Reference publication consumer. Identity is Organization-locked; description may override; offer state is Location-owned; capacity/schedule are runtime-derived.

**Locations.** Not a publishable catalog. Organization owns Location membership and navigation into the frozen Locations Runtime. Locations do not “consume” themselves through Publication Runtime.

**Processes.** Organization authors stage graphs and operating plans. Locations/contexts choose **availability** of a process (assignment). Full Publication Runtime (immutable process revisions) is deferred until in-flight record safety requires it; until then Processes remain live-on-save with assignment of availability.

**Operational Calculations.** Organization authors calculation and indicator definitions. Locations may consume shared definitions and supply **local targets/thresholds** where policy allows. Strong next publication consumer: proves **value inheritance + Controlled Difference**, complementary to Programs’ **availability assignment**.

**Fields & Statuses (Data Model).** Shared Organization vocabulary. Locations must not redefine fields or invent conflicting statuses. Location differences belong in Surfaces/visibility and process requirements — not in Field/Status publication.

**Actions / Automation.** Organization owns workflow and action definitions. Location/context **enablement** is assignment. Parameter overrides are Controlled Difference only when the action schema declares them.

**Communications.** Organization owns channels, templates, and send rules. Template **availability** at a Location is assignment; signature/local copy differences are Controlled Difference. Publication Runtime becomes mandatory when template identity must be immutable for audit/compliance.

**Access.** Roles and permissions are Organization-authored. Binding roles to Locations/Departments is **assignment**, not publication of a revision tree. Access does not use Programs-style revision publication.

**Surfaces.** Organization publishes presentation documents. Consumers are workspaces and queues. Not Location-assigned availability in V1 expansion; Location experience differences remain through scope on the surface host, not a second Surfaces editor.

---

## 2. Organization → Location distribution model

### Canonical lifecycle (Publication Runtime participants)

```text
Organization Draft
        ↓
     Validate
        ↓
Publish → Immutable Revision → Publication
        ↓
   Assignment / Delivery
        ↓
 Location Consumption pointer
        ↓
 Effective Resolution
        ↓
 Operational Runtime
```

### Who participates in the full lifecycle

| Stage | Programs | Operational Calculations | Communications | Processes | Access | Fields/Statuses | Surfaces | Locations |
|---|---|---|---|---|---|---|---|---|
| Draft | ✓ | ✓ | ○ | ○ | — | — | ✓ | — |
| Publish / immutable revision | ✓ | ✓ | ○ | ○ | — | — | ✓ | — |
| Assignment | ✓ | ○ (optional scope) | ✓ availability | ✓ availability | ✓ context bind | — | — | — |
| Location consumption | ✓ | ✓ | ✓ | ✓ | ✓ | read-only vocab | ✓ | — |
| Effective resolution | ✓ | ✓ | ✓ | ○ | assignment resolve | org default | published surface | — |
| Operational runtime | enrollment etc. | workspace metrics | send/runtime | BP runtime | authz | records | presentation | Location runtime |

### Who does **not** use Publication Runtime

- **Fields / Statuses** — shared vocabulary; no Location revision consumption.
- **Access** — assignment of people/roles to contexts; not revision delivery of role payloads to Locations.
- **Locations domain card** — navigation into Locations Runtime; not a published catalog.
- Any domain whose change must be live-on-save and does not yet require immutable consumer isolation.

**Rule.** A domain adopts Publication Runtime only when consumers must be protected from mid-flight draft edits. A domain adopts Assignment only when availability legitimately differs by Location or context. A domain adopts Override only when Controlled Difference names the field.

---

## 3. Organization Collection Pattern

Every publishable or assignable Organization domain inherits the Configuration **Collection** grammar where it has a catalog of objects.

### Inherited collection behaviors

| Behavior | Required when | Notes |
|---|---|---|
| Object rail / catalog | Domain has many named objects | Programs Collection is the publication reference |
| Search | Catalog ≥ ~8 objects | Quiet; no dashboard search chrome |
| Filters | Multiple lifecycle or health states | Draft / Published / Attention — not engine jargon |
| Publication indicator | Publishable domains | Draft · Published · Changes ready — from authoritative evidence only |
| Assignment indicator | Assignable domains | Assigned N of M Locations / Partial / Failed — never fake healthy |
| Health indicator | Domain reports readiness | Stay **Not assessed** until owner evidence exists |
| Quick actions | Domain mutation authority | New · Publish · Assign — never invent Apply for assignment domains |

### Collection does **not** require

- Location operational cards
- Capacity, staffing, or schedule widgets
- Commercial billing grids
- Per-domain redesign of the shell

**Rule.** Collection chrome is shared; object nouns and consequence lines are domain-owned.

---

## 4. Organization Detail Pattern

Detail inherits Configuration Detail grammar. Sections appear **conditionally**.

| Section | Show when |
|---|---|
| Overview | Always for Collection objects |
| Draft | Publishable domains |
| Published Revision | Publishable domains with ≥1 revision |
| Assignments | Assignable domains |
| Distribution / Delivery | Publishable + assignable (per-target results) |
| Impact Preview | Before assignment/delivery |
| History / Audit | Publishable or assignable with durable attempts |
| Overrides | Override-capable domains |
| Consumers | Domain declares runtime consumers |
| Dependencies | Domain declares upstream references (e.g. Calculations → Fields) |

### Conditional rules

1. Never show Draft/Published without authoritative domain evidence.
2. Never show Assignment for Organization-only vocabulary domains.
3. Never show Overrides unless field policy declares `location_may_override` or `location_must_supply`.
4. Never show Distribution retry without deterministic delivery identity.
5. Consumers and Dependencies are progressive disclosure — not landing cards.

---

## 5. Publication capability matrix

| Capability | Programs | Op. Calculations | Communications | Processes | Access | Fields | Statuses | Surfaces |
|---|---|---|---|---|---|---|---|---|
| Drafts | ✓ | ✓ | ○ | ○ | — | — | — | ✓ |
| Immutable revisions | ✓ | ✓ | ○ | ○ | — | — | — | ✓ |
| Publication | ✓ | ✓ | ○ | ○ | — | — | — | ✓ |
| Assignment | ✓ | ○ | ✓ | ✓ | ✓ | — | — | — |
| Distribution / delivery | ✓ | ○ | ○ | ○ | — | — | — | — |
| Retry | ✓ | ○ | ○ | ○ | — | — | — | — |
| Impact Preview | ✓ | ✓ | ○ | ○ | — | — | — | ○ |
| History | ✓ | ✓ | ○ | ○ | assignment log | — | — | ✓ |
| Overrides | ✓ limited | ✓ targets | ✓ content | ○ | — | — | — | — |
| Effective Resolution | ✓ | ✓ | ✓ | ○ | assignment | org vocab | org vocab | published |

**Why.** Publication exists to isolate consumers from drafts. Assignment exists to vary availability. Overrides exist only for named Controlled Differences. Fields/Statuses refuse publication because Location redefinition would fracture the org vocabulary. Access uses assignment of authority, not revision delivery of role documents to sites.

---

## 6. Location consumption model

### Shared rules

1. Locations consume **published** (or live-authoritative) Organization configuration — never editable Organization drafts.
2. Assignment advances a consumption pointer or availability binding; it does not clone operational truth.
3. Location-owned facts remain Location-owned.
4. Runtime computes derived values; Configuration does not pretend to own them.

### Per publishable / assignable domain

| Domain | How Locations receive | Immutable from Org | May differ locally | Location owns | Organization owns | Runtime computes |
|---|---|---|---|---|---|---|
| Programs | Assigned revision | key, name, category, eligibility | description (if allowed); offer state | offered/paused; evidence; resources | catalog identity; requirements | capacity, occupancy, schedule truth |
| Op. Calculations | Inherited published definition | formula identity; legal inputs | local targets/thresholds | local target values | definition; units; semantics | computed indicators |
| Communications | Inherit templates; assign availability | template identity when published | signature/local copy fields | which templates active; local copy | channels; templates; rules | delivery outcomes |
| Processes | Availability assignment | process identity / stages (when published) | enablement; limited params | enabled at Location | process definition | stage progression |
| Access | Role/context assignment | role/permission definitions | who holds what where | local membership bindings | roles; permissions | authorization decisions |
| Surfaces | Published surface docs | layout document | — (no Location Surfaces editor) | host record context | presentation documents | render composition |
| Fields/Statuses | Org vocabulary read | definitions | — | — | field/status catalogs | validation; transitions |

---

## 7. Controlled Difference expansion

Controlled Difference is **named, policy-gated, and server-resolved**. It is never silent.

| Domain | Must always inherit (Org-locked) | Legitimate local difference | Forbidden local difference |
|---|---|---|---|
| Programs | key, name, category, eligibility, requirements | description; offer posture; evidence | inventing a second Program identity; capacity |
| Op. Calculations | calculation identity, formula contract, units | target/threshold values; display preference where allowed | changing formula meaning; inventing metrics |
| Communications | channel identity; template key when published | signature; local greeting; availability | inventing channels that bypass org sender rules |
| Processes | process identity; stage graph (when published) | enabled/disabled; limited operating params | rewriting stages locally |
| Actions | action registration; permissions | enablement; declared parameters | unregistered side effects |
| Access | role and permission definitions | assignments to Location/Department | local permission invention |
| Fields/Statuses | entire definition catalog | none at definition layer | Location-specific field types or status keys |
| Surfaces | published layout document | none via override | Location fork of org surface |

**Law.** If a difference is not declared in field policy, it is not a Controlled Difference — it is a defect.

---

## 8. Runtime inheritance model

```text
Configuration Runtime (shell, Collection, Detail, visual language)
        ↓
Organization Runtime (domain registry, publisher/consumer cards)
        ↓
Configuration Publication Runtime (draft/revision/publication/delivery/consumption/effective resolution)
        ↓
Domain adapter (payload, validation, policies, operator language)
        ↓
Location Runtime / Operational Runtimes (local truth + execution)
```

Domains inherit **down** this stack. They do not create sibling runtimes. They register:

- publication mode (`live_on_save` | `publish_required`);
- distribution mode (`none` | `inherit` | `assignment` | `apply`);
- field policies;
- consumer list;
- authoritative evidence for Draft/Published/health.

**Apply** remains reserved for durable creation of Location-owned objects through a provider. It is not the default expansion path. Programs proved Assignment; expansion prefers Assignment or Inherit unless a domain explicitly needs Apply.

---

## 9. Visual language expansion

Extend; do not redesign.

| Pattern | Shared | Domain-specific |
|---|---|---|
| Collection | Stone canvas, object rail, quiet metadata, Bend Pine accent | Object nouns, consequence line, filters |
| Detail | Hero identity, sections, view/edit discipline | Which conditional sections appear |
| Publication | Draft / Published evidence chips | Validation copy |
| Assignment | Location checklist, preview, per-target results | Eligibility rules |
| History | Attempt list, retry affordance | Event vocabulary |

**Anti-patterns.** Do not copy Location operational Overview cards into Organization domains. Do not turn every domain into a Programs clone with empty Assignment sections. Do not expose engine terms (resolver, provider, checksum) in operator chrome.

---

## 10. Recommended implementation order (Product sequence)

This is Product validation order — not an engineering work breakdown.

| Order | Domain | Why next |
|---|---|---|
| 0 | **Programs** | Complete — assignment publication proven |
| 1 | **Operational Calculations** | Best Consumer #2 — see §11 |
| 2 | **Communications** | High operator value; Controlled Difference on content + template availability |
| 3 | **Processes** | Availability assignment without reopening BP authoring redesign |
| 4 | **Access** | Formalize assignment-of-authority as first-class Location consumption |
| 5 | **Surfaces** | Align presentation “publish” language with Publication Runtime evidence |
| — | **Fields / Statuses** | Remain Organization-only vocabulary until a separate Data Model constitution says otherwise |
| — | **Locations card** | Remains navigation into frozen Locations Runtime |

---

## 11. Product validation — Consumer #2

### Recommendation: **Operational Calculations becomes Consumer #2**

**Why precisely.**

1. **Complementary proof.** Programs proved **availability assignment**. Calculations prove **value inheritance + Controlled Difference** (local targets) against the same Publication Runtime — without reopening Assignment doctrine.
2. **Clean ownership.** Organization owns calculation identity and semantics; Locations own local targets; Runtime owns computed results. Matches four-owner doctrine.
3. **No frozen-surface conflict.** Does not redesign Locations, Programs, or Organization landing patterns.
4. **Real Location consumption.** Workspaces and processes already need org-defined indicators with local targets.
5. **Honest publication need.** Changing a formula mid-flight without revision isolation is operationally dangerous — Publication Runtime is justified, not decorative.
6. **Bounded overrides.** Targets/thresholds are a small, nameable Controlled Difference set — easier to certify than Communications content or Process graphs.

### Not Consumer #2

| Candidate | Why not yet |
|---|---|
| Communications | High value, but template/content difference surface is wider; better after Calculations tightens override discipline |
| Processes | Availability assignment is right, but immutable process revisions touch in-flight records — higher product risk |
| Access | Assignment-of-authority is real, but is not Publication Runtime; would under-exercise Consumer #2 goals |
| Fields/Statuses | Must stay Organization-only vocabulary |
| Surfaces | Presentation publish is real, but less Location-consumption proof than Calculations |

---

## 12. Ownership matrix (expansion view)

| Domain | Configuration owner | Location owns | Runtime owns | Commercial meaning (if any) |
|---|---|---|---|---|
| Programs | Organization Programs | Offer state; evidence; resources | Capacity; schedule; enrollment effects | Program is commercial unit |
| Op. Calculations | Organization Calculations | Local targets/thresholds | Computed indicators | May attach to Program later |
| Processes | Organization Processes | Enablement | Stage progression; outcomes | — |
| Communications | Organization Communications | Template availability; local copy fields | Delivery | — |
| Access | Organization Access | Role bindings at Location/Dept | Authorization | — |
| Fields/Statuses | Organization Data Model | — | Validation; transitions | — |
| Surfaces | Organization Surfaces | — | Presentation composition | — |
| Locations | Locations Runtime | All local operational configuration | Operational execution | — |

---

## 13. Certification criteria (for each future domain)

A domain is certified as a Configuration Platform participant only when:

1. **Classification** is recorded in this constitution (or a ratified amendment).
2. **One authoring home** exists under Organization (canonical `/organization/...` when migrated).
3. **Publication mode** and **distribution mode** are declared and match behavior.
4. If publishable: drafts never affect consumers; revisions are immutable; evidence is authoritative.
5. If assignable: Location operational truth is preserved; retry/idempotency rules hold where delivery exists.
6. If override-capable: every overridable field has an explicit policy; effective resolution is server-authoritative.
7. Collection/Detail inherit visual language without Location operational chrome.
8. No Apply semantics unless the domain truly copies into Location-owned objects via a durable provider.
9. Docs update the single canonical owners — no parallel doctrine.
10. Product browser certification covers landing, detail, and every declared capability that is operator-visible.

---

## 14. Product roadmap (constitution-level)

| Horizon | Outcome |
|---|---|
| **Now** | Ratify this constitution; keep Programs frozen as Consumer #1 |
| **Next** | Operational Calculations as Consumer #2 (publication + effective values + limited overrides) |
| **Then** | Communications Controlled Difference + template availability |
| **Then** | Processes availability assignment under Organization Collection |
| **Later** | Access assignment formalization; Surfaces publication evidence alignment |
| **Deferred** | `/organization/locations` and `/organization/processes` route convergence (routing only); Fields/Statuses Location publication (not planned) |

---

## 15. Ratification

This document is the binding Product Constitution for Configuration Platform Expansion. Engineering initiatives that expand Organization domains must cite this constitution and must not reopen frozen runtimes listed in §0.

**Canonical companions (unchanged owners):**

- `docs/platform/modules/configuration-platform.md`
- `docs/system/organization-configuration-runtime-v2.md`
- `docs/platform/core/configuration-ownership-and-inheritance.md`
- `docs/platform/operator/configuration-workspace-platform-doctrine.md`
- `docs/platform/foundation/platform-decisions.md`
