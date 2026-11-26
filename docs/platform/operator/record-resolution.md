---
owner: operator
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Record Resolution (Intake)

Canonical duplicate detection and record resolution for all intake sources.

## Flow

```
Intake Source → Intake Facts / Household Graph → Record Resolution → Create / Link / Update Proposal → Operator Review → Commit
```

## Where resolution lives

| Layer | Path | Role |
|-------|------|------|
| Types | `web/lib/intake/resolve/types.ts` | Source-agnostic result / candidate / proposal model |
| Matcher (pure) | `web/lib/intake/resolve/matchIdentity.ts` | Normalized identity evaluation rules |
| Queries | `web/lib/intake/resolve/queryMatches.ts` | Org-scoped Supabase lookups |
| Orchestrator | `web/lib/intake/resolve/resolveIntakeRecordResolution.ts` | Main entry — callable without Create Lead UI |
| Commit overlay | `web/lib/intake/resolve/applyResolutionToCommitSelection.ts` | Maps proposals onto Create Lead commit selection |
| API | `POST /api/admin/intake/record-resolution` | Operator surfaces (Create Lead) |

## Existing matching audit

### Reusable (canonical inputs)

| Module | What it does | Reuse |
|--------|----------------|-------|
| `web/lib/forms/intake/intakePersonMatch.ts` | Email/phone normalization, `decidePersonMatchFromIdLists`, name equality | **Core parent signals** — imported by resolver |
| `web/lib/intake/normalize/email.ts`, `phone.ts`, `personName.ts` | Intake fact normalization | Household graph + resolver inputs |
| `web/lib/forms/intake/intakeOpportunityDedup.ts` | Open opportunity lookup by guardian + location + child name | **Lead matching** — reused via `findExistingIntakeOpportunity` |
| `web/lib/bookingPersonCustomerResolve.ts` | `ensureCustomerForPersonNative` | Commit path after person link (not matching) |

### Create Lead–specific (commit / UX)

| Module | Notes |
|--------|--------|
| `executeCreateLeadHouseholdCommit.ts` | Multi-member persist — now reads resolution overlay on commit records |
| `createLeadCommitSelection.ts` | Operator commit selection + resolution overlay types |
| `IntakeHouseholdCommitReviewPanel.tsx` | Resolution badges and link/create actions |

### Unsafe to reuse as canonical resolution

| Module | Why |
|--------|-----|
| `findOrCreatePersonInOrgWithMeta` | **Write path** — `limit(1)` match then insert; hides ambiguity; no proposals |
| `findOrCreateChildPersonInOrg` | **Write path** — same; used only after resolution commit |
| `applyFormIntakeSafe` | Form-specific auto-create flags, review routing, opportunity creation — parallel system, not unified proposals |
| `findOrCreateGuardianPersonInOrg` (household commit) | Inline duplicate of find-or-create — bypasses resolution |

### Form intake parallel stack

`applyFormIntakeSafe` + `intakePersonMatch` + `resolveIntakeReviewDecision` implement Card 8 safe intake for **public forms** with link-metadata auto-create gates. Future convergence: build household graph → `resolveIntakeRecordResolution` → apply proposals (same as Create Lead).

## Confidence rules (first pass)

| Level | Parent examples | Child examples | Default proposal |
|-------|-----------------|----------------|------------------|
| `exact_match` | Exact email; exact 10-digit phone; name agrees | Full name + DOB; existing household member | `link_existing` |
| `probable_match` | — | First name + DOB with matched parent | `review_required` |
| `possible_match` | Full name only in org | Name without DOB | `review_required` |
| `no_match` | No signals | No signals | `create_new` |
| `conflict` | Multiple email/phone; email+different name | Multiple name/DOB candidates | `reject` |

Household: linked customer from matched parent/child → `exact_match` / `link_existing`.

Lead: open opportunity same household + location → `probable_match` / `review_required` (warn, do not auto-link).

## Commit rules

- `link_existing` → use `linked_entity_id`; skip person insert
- `create_new` → existing find-or-create paths
- `review_required` / `conflict` on included records → block commit
- Exact match never silently creates duplicate — server rejects exact match left in `review_required`

## POS / external integration

See `web/lib/intake/resolve/posIntegrationNotes.ts`. Invoke `resolveIntakeRecordResolution` server-side or POST to `/api/admin/intake/record-resolution`. Do not implement POS-specific duplicate logic in terminal clients.

## Non-goals (this sprint)

- POS-specific duplicate UI
- AI matching / merge tool
- New DB tables for resolution state (runtime types only)
