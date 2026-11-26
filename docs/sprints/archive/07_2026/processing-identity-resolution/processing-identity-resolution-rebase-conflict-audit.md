# Processing Identity Resolution V1 — Staging Rebase Conflict Audit

**Rebase:** `2b557238a` (pre-rebase tip) onto `origin/staging` `f1b262960`  
**Post-rebase tip:** `d978ecb2f`  
**Safety ref:** `backup/proc-identity-pre-rebase-1bcbe4312` (and pre-checklist commit ancestry)

## Conflicted files

### 1. Generated schema docs (commit `5da250f7a`)

**Files:** `docs/schema/schema-{columns,constraints,functions,indexes,policies-and-security,triggers}.md`

| Side | Change |
|------|--------|
| staging / HEAD | Newer generated header counts from post-base staging schema |
| Processing | Closeout regeneration header counts from isolated cert DB |

**Resolution:** Took Processing commit bodies (`--theirs`) for this intermediate closeout commit; conflict markers were header-count only. **Post-rebase:** regenerate schema docs from the reconciled isolated stack so staging + Processing migrations are both represented.

**Certification impact:** Documentation only; no runtime semantic change.

### 2. `docs/platform/foundation/release-history.md` (commit `790595fc1`)

| Side | Change |
|------|--------|
| staging | July 2026 Operational Expansion Wave 1 milestone |
| Processing | July 2026 Processing Identity Resolution V1 promotion-candidate entry |

**Resolution:** Kept **both** sections in chronological order (Wave 1, then Processing Identity).

**Certification impact:** Docs only; preserves staging truth and Processing closeout claim.

### 3. Doctrine reconciliation (commit `790595fc1`)

**File:** `docs/sprints/archive/07_2026/.../processing-identity-resolution-doctrine-reconciliation.md`

| Side | Change |
|------|--------|
| staging | Design-time note; sprint moved under `docs/sprints/archive/07_2026/` |
| Processing | Closeout disposition status |

**Resolution:** Kept Processing closeout disposition; retained archive path from staging rename.

**Certification impact:** Docs only.

### 4. Sprint doc directory rename (commits `986aeaf3d`, `6d8851f1c`, `2b557238a`)

**Files:** new promotion/rollback/cert-cleanup/migration-audit/preservation artifacts originally added under `docs/sprints/07_2026/...`

| Side | Change |
|------|--------|
| staging | Renamed sprint folder to `docs/sprints/archive/07_2026/processing-identity-resolution/` |
| Processing | Added closeout artifacts at the pre-rename path |

**Resolution:** Accepted git’s suggested archive location for all added artifacts. No content discarded.

**Certification impact:** Path-only; sprint pack remains complete under archive.

## Non-conflict auto-merges of note

- Canonical platform docs (`entity-model`, `record-system`, `architecture`, `platform-capabilities`, `documents-and-forms`, `glossary`, `implementation-patterns`) auto-merged.
- `package.json`: Processing cert scripts + staging `docs:lint*` scripts both present after rebase.
- Create Lead client adapters retained Processing `processing_case_id` / review-mode handling.
- No runtime Processing Identity file required a semantic conflict resolution.
- `featureFlags.ts` remains absent; `applyFormIntakeSafe` remains throw-only.

## Semantic change from conflicts?

**No.** All conflicts were documentation path/content. Runtime certification suite must still be re-run on the reconciled tip.
