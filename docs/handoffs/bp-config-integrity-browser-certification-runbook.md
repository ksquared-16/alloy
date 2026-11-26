# Stage editor publication workflow — browser certification

**Status: CERTIFIED, 2026-07-31 — 15/15 scenarios passing.**

| | |
|---|---|
| Executable spec | `certification/playwright/business-process-publication.cert.spec.ts` |
| Evidence | `certification/bp-config-integrity/evidence/` — 16 screenshots + `evidence.log` |
| Environment | isolated `alloy-cert` tenant (project `alloy-cert`, ports 544xx), full migration history, representative seed |
| Guard posture | **`enforce` — the default, not weakened for the run** |
| Shared infrastructure | **untouched** |

Companion: [`bp-config-integrity-handoff.md`](./bp-config-integrity-handoff.md).

## Reproducing it

```bash
certification/alloy-certify reset                     # pristine, pre-publication tenant
CERT_APP_PORT=3016 certification/alloy-certify serve  # app on slot 6's port
cd certification && NODE_PATH=../web/node_modules CERT_APP_URL=http://localhost:3016 \
  ../web/node_modules/.bin/playwright test -c playwright.config.ts
```

`reset` exists because publications and revisions are **immutable by design** — a certification run
that publishes cannot be undone in place, so the only honest reset is a fresh database. Node 22 is
required (`nvm use v22.21.1`); the harness previously fell through to whatever `node` was on PATH.

## How the blockers were resolved

The two blockers this document originally described were:

1. the shared dev Supabase project has none of this sprint's three migrations, and
2. the managed worktree holds no `SUPABASE_SERVICE_ROLE_KEY`.

Both were resolved by **giving slot 6 its own database** — the option this document recommended —
rather than by mutating shared infrastructure. The repo already had the right platform for it
(`certification/`, an isolated `alloy-cert` Supabase project whose `migrations` is a symlink to the
canonical directory, so this sprint's migrations came along for free). The service-role key is now
written into the cert env by `alloy-certify env`, read from the disposable local stack — the same
class of local-only, non-secret credential as the seeded operator password.

**The shared dev project was never modified.** Installing the `departments` write guard there in its
default `enforce` posture would have broken the other five worktrees' configuration saves.

## What was certified

URL: `/adminV2/settings/organization/processes` → Business Process → Stages tab → stage.
The publication bar renders under the stage editor's save bar (`data-testid="bp-publication-bar"`).

| # | Scenario | Proven |
|---|---|---|
| S1 | Initial load | Bar reads **Not published**; draft materialized from the projection at revision 1; no template defaults appeared (draft checksum == projection checksum) |
| S2 | Save draft | `publication_required: true`; draft 1 → 2; **projection byte-identical**; zero revisions; guard at `enforce` never fired; **reload shows the edited value** |
| S2b | Pre-existing defect | Publish blocked with object-level paths, **and the save still stood** (decision D3) |
| S2c | Repair | Fixing the references flips the bar to **Unpublished changes** and enables Publish |
| S3 | Runtime before publish | Second browser context on the operator surface; projection does not contain the draft edit; zero revisions |
| S4 | Validate | `can_publish: true`, 0 errors, 0 warnings, operator notice "ready to publish" |
| S5 | Valid publish | Exactly **one** revision and **one** publication act; projection updated; draft rebased onto the revision it produced; reload stable and reads **Published / revision 1** |
| S6 | Runtime after publish | Projection serves the published revision |
| S7 | Blocked publish | Injected `transition_ref: "lead_to_tour"` on Tour → **Publication blocked**, Publish disabled, **no revision created, projection unchanged** |
| S8 | Draft-edit conflict | Editor B saving from a stale token gets **409 `business_process_draft_edit_conflict`**; A's edit intact; B wrote nothing |
| S9 | Publication conflict | Out-of-band publish → **Draft conflict** chip, **Reload latest** button, Publish disabled, no revision 3, **A's draft work preserved, not silently rebased** |
| S10 | Unknown fields | A forward-compat marker and `row_grain_v1` survive save, reload **and publication into the projection** |
| S11 | Template seed law | A removed `queue_membership_v1` stays removed across two reloads; one draft row throughout, never re-seeded |

Every UI claim is paired with a SQL claim against the cert Postgres, so "runtime did not change" is a
fact about `departments.metadata`, not an inference from what the page rendered.

## Defects this run found

| # | Defect | Attribution | Status |
|---|---|---|---|
| 1 | **A saved stage edit did not survive reload.** `GET /api/admin/departments/[id]/lifecycle-builder` feeds the editor's V2 fields (purpose, grain, description, guidance, action catalog) and still read the **published projection**. The save wrote the draft; this read looked somewhere else. | slice 2 — the read migration missed a second route | **FIXED** — the GET now follows the read precedence |
| 2 | **"Published" rendered directly above "Runtime: never published".** Every existing tenant has configuration and zero publications, so the very first thing an operator saw was a contradiction. | slice 2 | **FIXED** — new `never_published` status, chip reads **Not published** |
| 3 | **Publish notice read "Published revision ?".** The route returned the service's camelCase `revisionNumber` while the UI (correctly) read `revision_number`. | slice 2 | **FIXED** — the route maps to snake_case like the rest of its response |
| 4 | **`alloy-certify serve` used whatever `node` was on PATH** and died on Node 16. | pre-existing, certification platform | **FIXED** — documented; run under `nvm use v22.21.1` |
| 5 | **`alloy-certify env` never wrote a service-role key**, so every admin surface 500s under the cert tenant. | pre-existing, certification platform | **FIXED** — `cmd_env` now writes it |
| 6 | **The canonical representative seed ships two dangling stage references** — three transitions target `closed_lost` where the stage is `closed`, and the waitlist stage's `offer_to_enrolling` rule moves to `enrollment` where the stage is `enrolling`. | pre-existing, `supabase/seed/local_representative_seed.sql` | **NOT FIXED — reported.** The gate is right and the seed is wrong. Left in place deliberately: it is exactly the shape a real legacy tenant has, and it gave S2b a genuine pre-existing-defect scenario instead of a synthetic one |
| 7 | **~140 React "Maximum update depth exceeded" errors** on the processes settings page. | **pre-existing** — measured at 145 with the slice-2 UI reverted to `HEAD~1` vs 134 with it applied | **NOT FIXED — out of scope.** Does not affect the certified flow |

## Residual risk

- **Defect 6** means the representative seed cannot be published as-is. Any future certification that
  needs a publishable graph must repair those two references first, as this spec does in S2c.
- **Defect 7** is noise in the console, not in the flow, but it is a real render loop somewhere on
  that page and should get its own investigation.
- The stage editor is certified; **no other editor family is**. Work Views, transitions, outcomes and
  the process-level PATCH still write the projection directly. The `lifecycle-builder` PATCH in
  particular now *reads* the draft while still *writing* the projection — deliberate and temporary,
  but it is an asymmetry that must close when that family migrates.
- Certification runs against the synthetic `northwind-early-learning` tenant. Firefly's actual
  configuration is not covered.
