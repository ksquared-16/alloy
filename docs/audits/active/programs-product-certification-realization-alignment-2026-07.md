---
owner: product-platform
status: complete
last_reviewed: 2026-07-17
concept: programs-product-certification-realization-alignment
supersedes: []
---

# Programs Product Certification Realization Alignment

> The capability translation remains accepted. Its final domain-first composition
> is certified in
> `programs-information-architecture-realization-2026-07.md`.

**Completion date:** 2026-07-17
**Canonical surface:** `/organization/programs`
**Reference:** [`programs-commercial-capability-inventory-2026-07.md`](programs-commercial-capability-inventory-2026-07.md)
**Final assessment:** **APPROVED — COMPLETE RICH CONFIGURATION DOMAIN**

## Executive result

Programs is no longer organized as a publication demonstration. It is a complete
Organization Configuration object whose read-first detail contains:

1. Overview
2. Definition
3. Offerings
4. Pricing
5. Availability
6. Requirements
7. Resources
8. Policies
9. Relationships
10. Publication
11. Assignments
12. History

Publication remains fully functional, but Distribution is composed inside that
concern. Programs-owned offering and variant authoring now lives in the same
Configuration Detail Runtime. Full tuition inheritance controls, Program-scoped
catalog products, registry-driven policy authoring, and pricing simulation are
available in context through existing Commercial APIs and execution paths.
Location availability, evidence, resources, capacity, and schedules remain
Location-owned projections with deep links.

## Translation matrix

| Legacy capability | Configuration Runtime location | Status |
|---|---|---|
| Program identity, description, category | Definition | Preserved |
| Audience, eligibility, qualifications | Requirements | Preserved and made visible |
| Required resource type | Resources | Preserved |
| Local rooms, evidence, capacity, schedules | Resources / Availability | Preserved as Location-owned projection |
| Attendance offerings | Offerings | Preserved and translated; create, edit posture, order, dates, remove/archive |
| Quantity variants | Offerings | Preserved and improved; presets, custom quantities, bulk create, edit lifecycle, protected remove/archive |
| Organization and Location tuition | Pricing | Preserved and translated; inheritance, override, clear, not-offered, dates, comparison, and explicit copy |
| Program/offering/variant policies | Policies | Preserved and translated; registry-driven create, edit, enable/disable, remove |
| Default policy references and commercial posture | Policies | Preserved and made visible |
| Program-scoped fees, add-ons, and deposits | Pricing / Fees & add-ons | Preserved and translated with behavior, category, scope, dates, and revenue relationship |
| Commercial category authoring | Pricing / Fees & add-ons | Preserved and translated |
| Pricing execution simulator | Pricing / Pricing preview | Preserved and translated as read-only execution |
| Revenue category / GL relationship | Relationships | Preserved and improved with missing-mapping posture; account administration remains authoritative elsewhere |
| Funding responsibility | Relationships | Preserved handoff; authoring deferred to Processing |
| Draft save and validation | Definition | Preserved |
| Immutable revisions | Publication | Preserved |
| Distribution, failure, retry | Publication | Preserved and subordinated to Program identity |
| Durable Location assignment and impact | Assignments | Preserved |
| Local offered state and authorization evidence | Availability | Preserved without moving mutation ownership |
| Publication/assignment/retry chronology | History | Preserved |
| Readiness and issue remediation | Overview / Attention / Collection | Expanded across rich concerns |
| Local Program identity rows and local identity editing | Locations compatibility only | Removed from canonical Program identity with Product justification |

## Runtime enhancement inventory

- `ConfigDetailRuntime` accepts domain concern keys while retaining the shared
  section-navigation contract.
- Setup and Attention point to directly named Program concerns and are summarized in Overview.
- Programs composes Publication and Distribution as one product concern.
- Collection readiness now assesses Definition, Requirements, Resources,
  Offerings, Pricing, Policies, Relationships, Publication, Assignment, and Availability
  when evidence is known.
- Collection rows expose lifecycle, offering/rate/catalog density, publication,
  assignment, readiness, and Attention; filters include lifecycle posture.
- The Programs adapter loads scoped local availability plus Programs-owned
  offerings/variants and related Commercial rates, policies, and Program-scoped
  products.
- Existing Commercial editors are focused to the selected Program and composed
  into Pricing, Policies, and Relationships rather than copied into a fork.
- Related reads retain Organization and allowed-Location scope.
- Managed Playwright storage state is supported without copying privileged
  credentials into the worktree.

## Programs-specific changes

- Programs supplies its concern labels, requirement language, offering editor,
  pricing relationship, and Location-availability interpretation.
- It does not own the shell, Collection geometry, Detail navigation,
  Publication, Assignment, Distribution evidence, History, Attention, or
  readiness composition.
- It does not mutate Location offer state, authorization evidence, resources,
  capacity, or schedules.
- It does not redefine tuition or policy storage; it uses existing Commercial
  APIs and authority.

## Browser walkthrough

Authenticated Chromium evidence is in
`docs/audits/evidence/configuration-runtime-completion/`.

| Evidence | Product proof |
|---|---|
| `01-programs-landing.png` | Collection and empty-to-first-object posture |
| `02-program-detail-draft.png` | Definition authoring and active/draft separation |
| `03-published-revision.png` | Read-first Overview after publication |
| `03a-program-requirements.png` | Requirements as an understandable concern |
| `03b-program-resources.png` | Organization requirement and Location ownership |
| `03c-program-offerings.png` | Offering and variant capability in Configuration Runtime |
| `03d-program-pricing-rates.png` | Canonical rate editor and effective-date controls |
| `03e-program-pricing-catalog.png` | Program-scoped fee/add-on/deposit catalog |
| `03f-program-policies.png` | Registry-driven Program policy authoring |
| `03g-program-pricing-preview.png` | Read-only Commercial execution preview |
| `03h-program-relationships.png` | Accounting, operational, and funding handoffs |
| `04-location-assignment-selection.png` | Assignment target selection |
| `05-impact-preview.png` | Local-truth-preserving impact preview |
| `06a-program-availability.png` | Assigned versus locally offered posture |
| `06b-program-attention.png` | Route-addressable issue and readiness concern |
| `06-partial-failure.png` | Publication delivery evidence and failure |
| `07-retry-success.png` | Safe recovery |
| `08-history-audit.png` | Cross-revision and retry history |
| `01a-programs-not-initialized.png` | Operator-safe empty/unavailable posture |

The walkthrough answers the governing question affirmatively: a first-time
operator can identify what the Program is, what the Organization owns, what each
Location owns, and which concern to use next.

## Removed capability report

No authoritative capability was removed.

The following legacy presentations were intentionally not translated:

- local category rows as Program identity;
- Location editing of published Organization identity;
- Commercial as canonical Program navigation;
- Apply language for assignment;
- copied Location resource/availability truth inside an Organization payload.

These are ownership corrections, not capability loss.

## Deferred capability report

The following remain explicitly deferred because no completed authoritative
capability exists to translate:

- Program retirement/reactivation;
- unassignment/revocation;
- approval, scheduled publication, rollback, restore, and branching;
- field-level revision diff and actor-rich History;
- subsidy/corporate payer expansion and funding authoring;
- accounting posting;
- a new eligibility/policy-builder DSL;
- simulator side effects.

## Validation

- Production TypeScript graph: passed.
- Test/Playwright TypeScript graph: passed.
- Focused Programs, authorization, Runtime model, routing, and issue tests:
  59/59 passed, including Programs UI and Commercial offering/variant contracts.
- Authenticated Chromium Programs certification: 2/2 passed.
- Focused lint: passed.

## Final Product assessment

**APPROVED — COMPLETE RICH CONFIGURATION DOMAIN**

Programs now feels like a complete Organization Configuration domain that
naturally inherits the Configuration Runtime. Publication is one capability,
not its identity. The implementation preserves legacy richness while making
ownership boundaries more legible and reusable for future domains.

**Programs Runtime successfully translated into the Configuration Runtime.**
