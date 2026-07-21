---
owner: product
status: certified
last_reviewed: 2026-07-18
---

# Programs Runtime Composition Alignment

## Assessment

**Programs Runtime successfully inherits the Locations Configuration Runtime
composition.**

Locations is the canonical Configuration Runtime reference implementation.
Programs is its first publishable domain consumer. Publication adds lifecycle
concerns; it does not define the workspace.

## Locations → Programs composition map

| Locations reference | Programs realization | Result |
|---|---|---|
| Persistent Location collection rail | Persistent Programs collection rail | Same selector, search, filter, Add, selected-row, and posture grammar |
| Location identity + Active status | Program identity + lifecycle status | Same object-header hierarchy |
| Location ownership breadcrumb | Organization → Programs → Program | Same ownership orientation |
| Edit location | Edit Program | Same object-level intentional edit mode; no Definition tab |
| Horizontal owned-concern tabs | Nine horizontal Program concern tabs | Same tab behavior and visual language |
| At a glance | At a glance | Same two-thirds summary region |
| Operational readiness | Publication readiness | Same explained one-third readiness region |
| Attention | Attention | Same conditional action region |
| How this location runs | How this Program works | Same connected-capability region |
| Location-owned concern surfaces | Program domain concern surfaces | Domain nouns differ; runtime grammar does not |

The visible Program tabs are exactly:

1. Overview
2. Offerings
3. Pricing
4. Availability
5. Policies
6. Relationships
7. Publication
8. Assignments
9. History

Definition, requirements, and resource requirements remain preserved. Overview
summarizes them, publication readiness evaluates them, and **Edit Program**
opens their focused editor. They are not a second navigation system.

## Runtime reuse map

| Runtime responsibility | Shared implementation | Locations | Programs |
|---|---|---|---|
| Configuration shell | `ConfigurationShell` | Yes | Yes |
| Detail composition | `ConfigDetailRuntime` | Yes | Yes |
| Object header | `ConfigObjectHeader` | Yes | Yes |
| Concern tabs | `ConfigWorkspaceTabBar` through `ConfigDetailRuntime` | Yes | Yes |
| Overview composition | `ConfigOverviewRuntime` | Yes | Yes |
| At-a-glance metrics | `ConfigGlanceMetrics` | Yes | Yes |
| Readiness | `ConfigOperationalReadiness` | Yes | Yes |
| Attention | `ConfigAttentionPanel` | Yes | Yes |
| Regions | `ConfigWorkspaceCard` | Yes | Yes |
| Selected-row grammar | canonical queue-row shell classes | Yes | Yes |

Programs uses `ConfigCollectionRail`, the publishable Collection Runtime
extension, while Locations uses `LocationsObjectSelector`, its reference
adapter. This is an intentional adapter difference: Programs must add
publication, assignment, and revision posture to each row. Both consume the
same collection geometry, search/filter/Add contract, selected-row primitives,
keyboard semantics, and responsive selector behavior.

## Overview comprehension

The selected Program now answers before detail navigation:

- **What is this Program?** Category, audience, and description appear in At a
  glance, with Edit Program as the focused definition path.
- **What offerings exist?** Offering and variant counts link to Offerings.
- **How is pricing configured?** Rate and fee/add-on posture links to Pricing.
- **Where is it available?** Location offer posture links to Availability.
- **Which policies apply?** Related policy count links to Policies.
- **What relationships exist?** Commercial/accounting relationship posture is
  explicit in How this Program works.
- **What revision is published?** Publication posture and active revision are
  explicit.
- **Where is it assigned?** Current assignment and drift posture are explicit.

## Browser evidence

Evidence directory:
`docs/audits/evidence/configuration-runtime-completion/`

- `00a-locations-reference-overview.png` — authenticated Locations reference.
- `03-programs-reference-overview.png` — authenticated populated Programs
  Overview using the inherited runtime.
- `11-locations-programs-side-by-side.png` — direct composition comparison.
- `03c-program-offerings.png`, `03d-program-pricing-rates.png`,
  `03f-program-policies.png`, `03h-program-relationships.png`,
  `05-impact-preview.png`, `06-partial-failure.png`, and
  `08-history-audit.png` — concern and lifecycle evidence.

The browser contract also asserts the exact nine-tab sequence, because the final
tabs may require horizontal scrolling at narrower workspace widths.

## Runtime gaps

The audit found two real reuse gaps and closed both:

1. Locations owned a page-local tab bar while Programs used Detail Runtime tabs.
   Both now consume `ConfigWorkspaceTabBar` through `ConfigDetailRuntime`.
2. Locations and Programs separately composed their Overview grids. Both now
   consume `ConfigOverviewRuntime`.

No remaining Product gap requires new platform infrastructure. A future
implementation may extract a lower-level generic Collection adapter to reduce
the two thin domain wrappers, but that would be code consolidation—not a
behavioral or compositional change.
