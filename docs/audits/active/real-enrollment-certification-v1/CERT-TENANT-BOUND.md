# wt4 now runs on `alloy-cert`. §§1–3 done and proven. §4 blocked on one missing caller.

Permit held throughout. **Zero writes to the shared dev database** — the application process no
longer holds credentials for it.

---

## §1 — QA operator credential rotated

Rotated `qa.operator@northwind.invalid` through the GoTrue Admin API (`PUT /auth/v1/admin/users/{id}`
on the cert stack's Kong) — the mechanism the CLI's `supabase auth admin` wraps; this CLI build has
no `auth` command, so the API underneath it was used directly.

The value is a 43-character random token, written **only** to
`~/.local/state/alloy-dev/gateway/auth/slot4/cert-operator.secret` (mode `600`, outside the repo).
It appears in no commit, log, report, screenshot or source file, and it is not in this document.

**Proven after rotation:**

| Property | Result |
|---|---|
| Exactly one auth user | ✅ `1` |
| Id / email / confirmation unchanged | ✅ `00000000-…-0002`, `qa.operator@northwind.invalid`, confirmed |
| Exactly one org membership | ✅ `1` distinct org |
| Membership → Northwind Early Learning | ✅ `00000000-…-0001` |
| Role | ✅ `admin` |
| Signed-in session resolves that org | ✅ `/api/admin/org-settings` → `org_id: 00000000-…-0001` |

## §2 — `alloy-cert` brought to this branch's migration level

Pending was **three**, not two:

| Version | What | Note |
|---|---|---|
| `20260820120000` | staging demo org AI policy | targets org `93667019-…`, which does not exist here — a **zero-row no-op**, included because the canonical mechanism brings the DB to the branch's level |
| `20260825120000` | READY NOW child-profile field seeds | required by this branch |
| `20260825140000` | `child_safeguarding_restrictions` | required by this branch |

**Drift check.** One version was applied here but absent from this branch: `20260818210000`
`w58_save_role_definition_and_grants` — the *same* migration this branch carries at
`20260820140000`, a single `CREATE OR REPLACE FUNCTION`, already applied and idempotent. Rather than
run the CLI's suggested `migration repair` against shared history, I gave my **scratch** project a
local copy of that version so the CLI's history check passed. **Shared migration history was not
edited.**

Applied via `supabase migration up --local --include-all` against a scratch project whose
`config.toml` carries `project_id = "alloy-cert"`. The canonical checkout was not modified.

**Proven:** 359 migrations applied · **zero** branch migrations pending ·
`child_safeguarding_restrictions` present with 23 columns, 9 CHECK constraints (including
`ck_safeguarding_active_requires_approval`, `ck_safeguarding_document_basis`,
`ck_safeguarding_effective_range`), RLS **enabled and forced**, both policies present · all 12
child-profile config fields seeded for the certification org.

## §3 — wt4 rebound to `alloy-cert`

Through the supported path: a scratch `ALLOY_CONFIG_FILE` that is a copy of the operator's own
config with **only** the two `ALLOY_ENV_SOURCE` / `ALLOY_SERVER_ENV_SOURCE` lines redirected. The
operator's config and the worktree's trusted env were not edited. (A bare exported env var does not
work — `alloy_load_config` sources the config file *after* it, overwriting it.)

The cert env source is minimal and deliberately carries **no Stripe, Resend, Twilio or OpenAI
credentials**: a certification tenant has no business holding live third-party keys. Nine variables,
down from twenty-two.

**Proven from the running application, not from shell variables:**

| Proof | Result |
|---|---|
| Processing cases visible to the app | **0** (shared dev had 12) |
| Form definitions visible | **0** (shared dev had 32) |
| Resolved org | `00000000-…-0001` Northwind Early Learning |
| Auth cookie | `sb-127-auth-token` — the local project; `sb-ikaxilmwmrmbagoidedu-auth-token` is gone |
| Shared-dev project ref in the server process env | **absent** |

That last two lines are the zero-mutation guarantee going forward: the application process holds no
credential that can reach the shared project. The before-state fingerprint
(`evidence/shared-dev-fingerprint.json`, sha256 `7730d8da…`) is preserved for the final proof.

## §4 — blocked: nothing in the product attaches a second source to a case

The packet feature needs one case with three sources. `processing_case_sources` has always allowed
it (`role: primary | related`), and `buildPacketIntakeForCaseSafe` reads every source. The canonical
writer exists too:

```ts
// lib/pos/processingCase/openProcessingCaseFromSource.ts
/** Attach an additional (related) source to an existing case. Never a primary; never forks the case. */
export async function attachRelatedSource(...)
```

**It has no callers.** No API route, no UI action. `POST /api/admin/documents/upload` always opens a
*new* case with a `primary` source, one per document — which is why every case in both databases has
`relatedSourceCount: 0`.

So "Analyse as one packet" is reachable in the UI, and the state it analyses cannot be produced by
an operator. That is the missing primitive, and it is narrow.

### The smallest decision

1. **Authorize me to call the canonical `attachRelatedSource` path directly** for the three
   certification artifacts (canonical function, canonical table, `role: "related"`). Fastest, and it
   is the path the previous instruction named — *"use the canonical Documents +
   `processing_case_sources` paths"*. It leaves the product gap open.
2. **Authorize the missing route** — a thin `POST /api/admin/processing/cases/[caseId]/sources` that
   calls `attachRelatedSource`, plus the operator affordance. Closes the gap properly; more work, and
   it is product surface rather than certification.

I did not insert rows by hand, which is why I am asking rather than proceeding.

## State

Permit held. Credential rotated and stored out of band. Migrations applied. wt4 bound to
`alloy-cert`. **No case, no document, no decision, no publish.** Branch clean.
