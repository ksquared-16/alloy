---
owner: product-platform
status: complete
last_reviewed: 2026-07-17
concept: programs-product-certification-realization-alignment
supersedes: []
---

# Programs Product Certification Realization Alignment

**Completion date:** 2026-07-17
**Canonical surface:** `/organization/programs`
**Reference:** [`programs-commercial-capability-inventory-2026-07.md`](programs-commercial-capability-inventory-2026-07.md)
**Final assessment:** **APPROVED — COMPLETE RICH CONFIGURATION DOMAIN**

## Executive result

Programs is no longer organized as a publication demonstration. It is a complete
Organization Configuration object whose read-first detail contains:

1. Overview
2. Definition
3. Requirements
4. Resources
5. Availability
6. Offerings
7. Pricing
8. Publication
9. Assignments
10. History
11. Attention

Publication remains fully functional, but Distribution is composed inside that
concern. Programs-owned offering and variant authoring now lives in the same
Configuration Detail Runtime. Related tuition and policy posture is visible in
context; tuition may be authored through its existing Commercial API without
changing authority. Location availability, evidence, resources, capacity, and
schedules remain Location-owned projections with deep links.

## Translation matrix

| Legacy capability | Configuration Runtime location | Status |
|---|---|---|
| Program identity, description, category | Definition | Preserved |
| Audience, eligibility, qualifications | Requirements | Preserved and made visible |
| Required resource type | Resources | Preserved |
| Local rooms, evidence, capacity, schedules | Resources / Availability | Preserved as Location-owned projection |
| Attendance offerings | Offerings | Preserved; create, edit posture, order, dates, remove/archive |
| Quantity variants | Offerings | Preserved; create and inspect |
| Organization and Location tuition | Pricing | Preserved; inspect and author by variant, scope, and cadence |
| Program/offering/variant policies | Pricing / Related policies | Preserved as authoritative linked capability |
| Default policy references and commercial posture | Pricing / Related policies | Preserved and made visible |
| Draft save and validation | Definition | Preserved |
| Immutable revisions | Publication | Preserved |
| Distribution, failure, retry | Publication | Preserved and subordinated to Program identity |
| Durable Location assignment and impact | Assignments | Preserved |
| Local offered state and authorization evidence | Availability | Preserved without moving mutation ownership |
| Publication/assignment/retry chronology | History | Preserved |
| Readiness and issue remediation | Overview / Attention / Collection | Expanded across rich concerns |
| Products, categories, GL mapping, simulator | Authoritative Commercial/Financial surfaces | Preserved by relationship; not copied into Program payload |

## Runtime enhancement inventory

- `ConfigDetailRuntime` accepts domain concern keys while retaining the shared
  section-navigation contract.
- Configuration setup and Attention can point to rich domain concerns.
- Programs composes Publication and Distribution as one product concern.
- Collection readiness now assesses Definition, Requirements, Resources,
  Offerings, Pricing, Publication, Assignment, and Availability when evidence is
  known.
- The Programs adapter loads scoped local availability plus Programs-owned
  offerings/variants and related Commercial rates/policies.
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
| `03d-program-pricing.png` | Variant pricing and related policy context |
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
  27/27 passed, including 3 Programs UI realization tests.
- Authenticated Chromium Programs certification: 2/2 passed.
- Focused lint: passed.

## Final Product assessment

**APPROVED — COMPLETE RICH CONFIGURATION DOMAIN**

Programs now feels like a complete Organization Configuration domain that
naturally inherits the Configuration Runtime. Publication is one capability,
not its identity. The implementation preserves legacy richness while making
ownership boundaries more legible and reusable for future domains.
