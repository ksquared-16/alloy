# Stage editor publication workflow — browser certification runbook

**Status: NOT RUN.** Everything below is prepared and blocked on one decision, recorded here so the
gap is visible rather than implied.

Companion: [`bp-config-integrity-handoff.md`](./bp-config-integrity-handoff.md).

## Why it has not run

Two independent blockers, both about *where the database is*, neither about the code:

1. **The shared dev Supabase project does not have this sprint's schema.** All three migrations are
   unpushed and local-only:
   - `20260730120000_business_process_configuration_publication_v1.sql` — `business_process_drafts`,
     `business_process_revisions`, the publish and rollback RPCs
   - `20260730130000_business_process_projection_write_guard.sql` — the `departments` write guard
   - `20260731120000_business_process_draft_revision_cas.sql` — the draft-edit token + its trigger

   Without them the stage editor's first call (`readDraft`) fails, so the page cannot load at all.

2. **The managed worktree holds no `SUPABASE_SERVICE_ROLE_KEY`.** `web/.env.local.agent` carries only
   the anon key, and every `/adminV2` admin route builds a `createAdminClient()`. Loading the
   canonical `/Users/Kelly/Alloy/web/.env.local` was refused by the permission classifier three times
   in an earlier session.

### The decision behind blocker 1

Applying the migrations to the shared dev project is not a neutral act. **The write guard defaults
to `enforce`**, and it is a `BEFORE INSERT OR UPDATE` trigger on `departments`. The moment it exists,
every *other* worktree's configuration save — none of which has been migrated onto draft persistence
— starts failing with an opaque Postgres `42501`. Applying it would therefore require, in the same
change:

```sql
ALTER DATABASE <db> SET alloy.lifecycle_guard = 'warn';
```

Six worktrees share that one tenant (`DEV_QUEUE_ORG_ID=93667019-…`, project `ikaxilmwmrmbagoidedu`).
That is why this is a decision, not a step.

**Kelly's call, 2026-07-31: certify the browser separately.** Ship the slice on Postgres + vitest
evidence; do not change shared infrastructure to get a screenshot.

## The cleanest way to unblock

Give slot 6 its **own** database rather than mutating the shared one. Blast radius zero, and it
removes the `warn`-posture caveat entirely:

```bash
supabase start                     # needs Docker running; provides Postgres 17 on :54322
supabase db reset                  # applies the full migration history, this sprint's included
```

then point `web/.env.local.agent` at the local stack and start the server:

```bash
alloy-dev-start wt6-bp-config-integrity        # port 3016
```

Containment first — all managed worktrees share one live tenant, so confirm nothing else is up:

```bash
lsof -nP -iTCP:3011-3016 -sTCP:LISTEN
```

## What to certify

URL: **`/adminV2/settings/organization/processes`** → select a Business Process → select a stage.
The publication bar renders directly under the stage editor's sticky save bar
(`data-testid="bp-publication-bar"`).

| # | Step | Expected | Selector |
|---|---|---|---|
| 1 | Open a stage on a department that has never published | Bar shows **Published**, "Runtime: never published" | `bp-publication-status`, `bp-publication-published-revision` |
| 2 | Change the stage purpose, Save stage | Topbar reads **Draft saved**, bar flips to **Unpublished changes** with the "runtime will continue using the currently published configuration" sentence | `stage-editor-v2-saved`, `bp-publication-message` |
| 3 | **Reload the page**, reopen the stage | The edit is still there. This is the assertion slice 1 could not make | — |
| 4 | Inspect `departments.metadata.lifecycle_builder_v1` in the DB | Unchanged. Runtime has not moved | — |
| 5 | Press **Validate** | Notice reports ready-to-publish or lists blocking issues | `bp-publication-validate`, `bp-publication-errors` |
| 6 | Press **Publish** | Notice reads "Published revision N. Runtime is now using it."; bar flips to **Published** | `bp-publication-publish`, `bp-publication-notice` |
| 7 | Re-inspect the projection | Now carries the edit; `configuration_publications` has one new row; `business_process_revisions` has one new immutable revision | — |
| 8 | Author an outcome with `transition_ref: "lead_to_tour"` and no such outgoing transition, Save, then Publish | Save succeeds (D3: drafting is permissive). Publish is refused with the precise dangling-reference message and its object path | `bp-publication-errors` |
| 9 | Open the same stage in two tabs, save in tab A, then save in tab B | Tab B gets the draft-edit conflict message, not a silent overwrite | — |
| 10 | Publish from tab A after tab B published | **Draft conflict** chip and a **Reload latest** button instead of Publish | `bp-publication-reload` |

Steps 8–10 already pass against real Postgres —
`certification/bp-config-integrity/04-publication-workflow.sql`, 24/24. What the browser adds is
proof that the **UI reaches** those paths and renders the right words, not that the paths work.

## What is already proven without a browser

- **76/76 real-Postgres scenarios** across `01`–`04`, including the stale-publication conflict, the
  structural draft-edit token, and "a blocked publish creates nothing".
- **19 vitest assertions** on the read precedence, draft survival across reload, runtime staying
  put, and the publication gate.

The residual risk the browser would close is narrow and honest: **wiring**. Whether
`configuration_state` actually reaches the bar, whether the buttons post what they claim, and
whether the copy reads correctly at width. No logic in this slice depends on the browser to be
correct — but nor should anyone claim the operator experience is verified until this runs.
