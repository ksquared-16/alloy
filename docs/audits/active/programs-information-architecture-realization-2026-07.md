---
owner: product
status: completed
last_reviewed: 2026-07-17
supersedes: []
---

# Programs Runtime — Information Architecture Realization

## Result

**APPROVED — DOMAIN-FIRST COMPOSITION REALIZED**

Programs remains a consumer of the frozen Configuration, Publication, and
Assignment runtimes. This realization changes composition only:

- the selected Program presents Overview, Definition, Offerings, Pricing,
  Availability, Requirements, Resources, Policies, Relationships, Publication,
  Assignments, and History;
- a grouped concern map replaces the overflowing horizontal row while keeping
  every concern directly visible;
- Attention and setup readiness live in Overview instead of becoming competing
  navigation;
- the generic Configuration concern is removed from Programs product language.

Publication and Assignment behavior, routes, persistence, and ownership did not
change.

## Whole-Program Overview

Overview now explains the Program before an operator opens an editor. It shows:

- definition and audience;
- offering and variant posture;
- tuition-rate, fee/add-on, and preview posture;
- Location-owned availability;
- Commercial-owned policy posture;
- Accounting and operational relationships;
- publication and assignment posture;
- current Attention and setup readiness.

Every posture row deep-links to its authoritative concern.

## Capability composition

| Accepted Commercial capability | Programs location | Authority |
|---|---|---|
| Program identity and definition | Definition; summarized in Overview | Programs / Organization |
| Offerings and quantity variants | Offerings | Programs |
| Tuition, inheritance, comparison, not-offered, and effective dates | Pricing → Tuition rates | Commercial Pricing Runtime |
| Fees, add-ons, deposits, and categories | Pricing → Fees & add-ons | Commercial catalog |
| Pricing execution simulator | Pricing → Pricing preview | Commercial execution; read-only |
| Program/offering/variant policies | Policies | Commercial policy registry |
| Local offer state and evidence | Availability | Locations; read-only projection |
| Resource type, rooms, capacity, and schedules | Resources | Program requirement; Location delivery truth |
| Revenue category and GL mapping posture | Relationships | Accounting |
| Enrollment, waitlist, placement, and funding consumers | Relationships | Respective operational owners |
| Immutable revision lifecycle and distribution evidence | Publication | Configuration Publication Runtime |
| Durable Location consumption | Assignments | Configuration Assignment Runtime |
| Revision, assignment, retry, and failure evidence | History | Configuration History Runtime |

No accepted capability is hidden behind a generic Configuration section.

## Pricing source of truth

`TuitionGridWorkspace` is the sole tuition-rate editor in Programs. The former
compact rate editor and duplicate rate summary were removed. Secondary Program
surfaces summarize pricing or open the canonical editor.

Effective start and end dates are edited and persisted by the shared Commercial
pricing workspace using the existing `effective_start` / `effective_end`
contract. Programs does not own a separate date model or mutation path.

## Ownership certification

- Availability mutation remains in Locations.
- Rooms, capacity, evidence, and schedules remain Location-owned.
- Policy authoring continues through the Commercial policy registry.
- Rate and catalog authoring continue through Commercial APIs.
- Revenue account administration remains Accounting-owned.
- Funding responsibility remains Processing-owned.
- Publication and Assignment retain their shared runtime owners unchanged.

## Authenticated browser evidence

Evidence directory:
`docs/audits/evidence/configuration-runtime-completion/`

| Evidence | Demonstrates |
|---|---|
| `03-published-revision.png` | Whole-Program Overview and domain posture |
| `03c-program-offerings.png` | Offering and variant authoring |
| `03d-program-pricing-rates.png` | Canonical rate editor and effective-date controls |
| `03e-program-pricing-catalog.png` | Program-scoped fees and add-ons inside Pricing |
| `03f-program-policies.png` | First-class Commercial-owned policy concern |
| `03g-program-pricing-preview.png` | Read-only execution preview inside Pricing |
| `03h-program-relationships.png` | Accounting and operational ownership handoffs |
| `06a-program-availability.png` | Location-owned availability projection |
| `06b-program-overview-attention.png` | Attention integrated into Overview |
| `08-history-audit.png` | Cross-revision history |
| `10-responsive-narrow.png` | Grouped concern map without horizontal overflow |

The Chromium journey runs through an authenticated Admin shell with deterministic
populated Program fixtures; the live-load check uses the same authenticated
session without replacing the Programs API.

## Validation

- Focused Configuration Publication, Programs, offerings, variants, and tuition tests: 74/74 passed.
- Production TypeScript graph: passed.
- Test and Playwright TypeScript graph: passed.
- Focused ESLint: passed.
- Authenticated Chromium Programs certification: 2/2 passed.
- Documentation lint completed; repository-wide pre-existing generated-boundary,
  archived-link, and orphan findings remain.

## Final assessment

Every capability accepted in the Commercial Translation Audit is discoverable,
understandable, correctly owned, and naturally composed. No new platform
infrastructure, Publication behavior, Assignment behavior, or Operational
Calculations were introduced.

**Programs Runtime successfully translated into the Configuration Runtime.**
