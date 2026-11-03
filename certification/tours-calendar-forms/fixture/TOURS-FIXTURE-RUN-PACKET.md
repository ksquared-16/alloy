# Tours certification fixture — local runner and the later isolated QA packet

Sprint `OPWORK_2CEA84351D90_SPRINT_EB9A9359C92B`, branch `sprint/opwork_2cea84351d90_sprint_eb9a9359c92b`.

Slices on top of the certified candidate `e94a48af3d87` (not rewritten; its checkpoint `ick_93480ca46501` stays as
recorded and covers `e94a48af3d87` only):
- `tours-certification-fixture-runner` `110bcf84d`;
- `tours-fixture-retained-row-semantics` `4edb2ab3f` — certified and RELEASED as checkpoint `ick_3875476a8108`
  (release `spr_b40e4abbc674`). It is kept as the **prior revision**: not rewritten, and not executable under the
  installed executor (§0);
- `tours-fixture-a741-persona-binding` `38b5966bc` — certified and RELEASED as checkpoint `ick_9b21253d2610` (release
  `spr_56956aad3d1d`, 129-test evidence). Kept as recorded: not rewritten, not superseded.

**Revision 3 (this file's revision) is an explicit SUCCESSOR on local branch `tours/eb9a9359-v2-successor`**, one commit
on top of `38b5966bc`. It is not a slice of the sprint and not a checkpoint: registering a checkpoint on this sprint
would mark `ick_9b21253d2610` SUPERSEDED and revoke release `spr_56956aad3d1d` (toolkit `sprint-objective.mjs`
`applyRegisterCheckpoint`), which this work must not do. It is NOT substituted into the existing PR or release
approval. Its exact commit id is in the platform handoff (§9), never in this file (a file cannot carry its own
commit id, and the pins name every byte of the program).

## R3. Revision 3 — authority v2 (program pins, API identity) and two run-owned forms

Two setup gaps remained after Revision 2. Both are closed locally; neither is live evidence.

| Gap | Revision 3 |
|---|---|
| Registration does not adopt the existing safety checks: the installed entry (toolkit `20261101-2aa8b30d6dd8`) is v1, so the child's authority check was **consistency only** | The runner adopts **authority v2** through the shared verifier `web/scripts/qa/isolatedFixtureAuthorityV2.mjs`, byte-identical to Financials `470f8594` (sha256 `e25649c2…`; vectors `5f7a6c9d…`). `web/scripts/qa/toursFixtureAuthority.mjs` adds only Tours' program, its org (`qa_shared`, source `persona`), `requireApi: true` and program pins — the same rule and codes as Financials and Enrollment. Order: argv/env shape → A741 binding → **v2 verify** (live provenance, window, binding, program/candidate/script, org, database identity, API identity, hold, pins) → service key → session file → **attested gate** (frozen `{DATABASE_URL, env, verified api_url}`, re-verified) → client. A v1 record is refused (`fixture_authority_org_unbound`): **today, under the installed v1 entry, every execution refuses**. No v1 fallback |
| The two G-T5 lead-capture forms do not exist in `qa_shared`, and the fixture borrowed seed forms by title | The fixture **owns exactly two forms** per QA run, authored through the product Forms routes as the persona (`POST /api/admin/forms` → `/versions` → `/publish`), with the stored intent `enrollment_lead` so the product makes their links lead-capture. Run-owned keys `tours_cert_form_{a,b}_<sha256(qa_run_id)[:12]>`; marker `{qa_fixture, qa_fixture_key, qa_run}` on definition, version and link. No lookup by title, no seed org, no direct insert (`web/lib/qa/toursFixture/toursFixtureForms.ts`) |

Ownership and failure handling for the forms (each a synthetic regression):
- **Collisions are refused before any other write.** A row at a run key is refused if it is unmarked, another
  fixture's, another run's, or in the wrong role (`forms_form_key_not_owned`). A third run-marked form is refused
  (`forms_unexpected_run_form`), and so are an inactive form, a form without the intent, a version that is not this
  run's, and two published versions.
- **Foreign orgs are refused.** A run key already present in another org → `forms_form_key_in_foreign_org`. A
  route create that lands outside the verified org → `forms_form_created_outside_fixture_org`, and nothing else is
  written. The stray row is reported, never deleted.
- **Idempotent, with partial-failure recovery.** Every step is found-or-created. An interrupted ensure completes on
  rerun: a definition without a version gets one draft, and an owned draft is published, never a second.
- **Links are run-scoped.** Another run's fixture link still live at the site → `other_run_fixture_links_active_reset_first`.
  If this run was already reset → `run_links_revoked_new_qa_run_required` (revoked links cannot be revived). Both
  refusals happen before any write.

**Disposition, accounted separately** (no deletion capability is invented):

| What | ensure | reset | after reset |
|---|---|---|---|
| live fixture rows (`census count=`) | 9 | `removed=6` physical deletions (booking, rule, person, household, membership, opportunity) + `links_revoked_this_reset=3` | 0 |
| revoked links (`retained_revoked_links=`) | 1 | 4 | 4 — retained (the product has no link deletion) |
| fixture forms (`retained_fixture_forms=`) | 2 (`forms_created_this_ensure=2` on the first ensure, 0 after) | 2 | 2 — retained as is (not archived, not deactivated) |
| their published versions (`retained_fixture_form_versions=`) | 2 (`form_versions_created/published_this_ensure=2` first, 0 after) | 2 | 2 — retained (published versions are immutable) |

Rows outside the fixture's accounting:
- **The forms routes write nothing else.** Every trigger on `form_definitions`, `form_definition_versions` and
  `form_public_links` acts in-table (updated_at, org sync, immutability, consistency). There is no audit or event
  row.
- **Records the QA run itself creates** (T1–T6) are not fixture rows and no reset touches them: booking attempts,
  public submissions, and the intake persons, households and opportunities they create. They belong to the QA run's
  own evidence and retirement, and must be counted by the QA run's census.

Local proof, Revision 3 (synthetic only; receipt ids in the lane report):
- 126 synthetic cases in two files: `toursCertificationFixture.test.ts` (84) and `toursFixtureAuthority.test.ts`
  (42). The second runs the real v2 verifier over a synthetic executor store and reproduces the platform vectors.
  Its controls: forged, absent, replayed and expired records; wrong org, port and shared target; held, changed,
  reforged and unavailable holds; and every pin refusal. The runner refuses before reading the service key or the
  session file, and builds ports once, from the attested copy;
- the real entry refuses a pre-v2 environment with `✗ refused_executor_binding_absent`, exit 2, before any I/O;
- 10 plants (no API requirement, no pins, seed org, verdict ignored, no foreign-org check, no ownership check,
  links not run-scoped, revoked-run refusal dropped, post-create check dropped, env API origin instead of the
  verified one) → all red, all restored by checksum;
- `typecheck`, `typecheck:tests` and the focused suites passed through the broker.

## 0. Revision 2 — reconciled with the installed executor (toolkit `66f2d0dab2c7`, A741F0C6D2E9)

The runner at `4edb2ab3f` was written against toolkit `b3c80db2e9aa`. The installed toolkit is `66f2d0dab2c7`
(`installed_at 2026-10-30T20:05:52Z`, identical to vacilando `main`). It declares `tours_certification`
`fixture_org: persona` and `preview: true`. The executor resolves the bound persona's org and the trusted preview
itself and passes them to the child. The old runner ignored that binding:

| Mismatch at `4edb2ab3f` | Effect under the installed executor | Revision 2 |
|---|---|---|
| hard-coded seed org `…0001` and Lakeside `…0011` | service-role writes into the seed org while the executor bound `qa_shared`; the Forms routes would be called as a `qa_shared` persona against seed-org forms | org = `ALLOY_CERT_FIXTURE_ORG_ID` with `_SOURCE=persona`, accepted only as `qa_shared` `4acc9386…`. Site = that org's registered `qa_north` `21c9be10…`, created by the QA run's own local structure ensure. **No seed fallback**: absent → `executor_binding_absent`; seed org → `fixture_org_mismatch` / `fixture_org_not_persona_bound` |
| preview origin read from the session file's `origins` | a URL chosen by the session file | requests go only to `ALLOY_QA_PREVIEW_ORIGIN` (loopback, with a port). Cookies come only from `ALLOY_QA_SESSION_ORIGIN`'s host. The file must hash to `ALLOY_QA_SESSION_SHA256` |
| no authority check | — | the `ALLOY_QA_AUTHORITY_FILE` record must hash to `_SHA256` and match request / fixture / operation / `npm_script` / run / environment / candidate / binding digest. `mutating` must be `false` for count and `true` for ensure/reset, inside its validity window. This is **consistency only**: live provenance is the toolkit's `verifyFixtureAuthority` |
| `verticals.eq("org_id", …)` | `verticals` has no `org_id` column, so ensure fails on any org | the active platform `childcare` vertical, as `lib/dev/seedChildcareDemo` resolves it |

A partial binding is refused (`binding_incomplete`), never completed from elsewhere. Every refusal happens before a
port is built.

The `dev:qa:tours-fixture` script body is unchanged: the pin stays `6d58a56a…f996`.

Local proof (synthetic only):
- 60 synthetic cases (35 before), 23 of them on the binding: 16 refusals before any port, plus authority-field, validity-window, mutating, cookie-host and session-URL controls; with the covering Tours suites, 6 files 100/100 on the final tree;
- 6 plants (seed-org fallback, unchecked `mutating`, skipped digest, session-file URL, legacy seed mode, org-filtered
  vertical) → 9 failures, all restored;
- `typecheck` and `typecheck:tests` PASSED through the broker;
- the real entry refuses a pre-A741 environment with `✗ refused_executor_binding_absent`, exit 2, before any I/O.

**Candidate for the isolated run = the exact tip of the sprint's newest CERTIFIED checkpoint** (`vac sprint status`
names it; a file cannot carry its own commit id). The executor refuses any other HEAD or a dirty tree.

## 1. The runner (product side of the installed contract)

Installed toolkit `66f2d0dab2c7` (was `b3c80db2e9aa`), `lib/certification-fixture.mjs` → `tours_certification`:
- `qa_bound`, `npm_script: "dev:qa:tours-fixture"`, ops `ensure` (`--ensure`), `count` (`--count`, census),
  `reset` (`--reset`);
- `reserved_namespace: "tours-cert.alloy.invalid"`, `reset_limit: 200`;
- executor: `npm run --silent dev:qa:tours-fixture -- <op>` in `<worktree>/web`, with a from-scratch environment.

| File | Role | Compiled by |
|---|---|---|
| `web/package.json` | `"dev:qa:tours-fixture": "tsx --tsconfig tsconfig.json scripts/qaToursFixture.ts"` — **script-body pin `6d58a56a52afc71eab3fb274c8bb5c88fe197001f5880dfe9bdf705e0825f996`** (toolkit `scriptBodyDigest`) | — |
| `web/scripts/qaToursFixture.ts` | entry; loads no `.env` | `typecheck:tests` (`tsconfig.json`); plus entry-load proof (§2) |
| `web/lib/qa/toursFixture/toursCertificationFixture.ts` | guards, plans, ownership, bounds, verification, safe output (pure, port-injected) | production build typecheck + `typecheck:tests` |
| `web/lib/qa/toursFixture/toursCertificationFixturePorts.ts` | real ports: isolated DB (service role, loopback only) + the preview's Forms routes as the QA persona | production build typecheck + `typecheck:tests` |
| `web/lib/qa/toursFixture/toursFixtureForms.ts` | R3: the run's two forms — ownership, collision / foreign-org refusals, idempotent ensure through the routes | production build typecheck + `typecheck:tests` |
| `web/scripts/qa/toursFixtureAuthority.mjs` | R3: the Tours v2 program (org, `requireApi`, pins) over the shared verifier | `typecheck:tests` (allowJs) |
| `web/scripts/qa/isolatedFixtureAuthorityV2.mjs` | R3: the shared verifier, byte-identical to Financials `470f8594` | `typecheck:tests` (allowJs) |
| `web/tests/qa/toursCertificationFixture.test.ts`, `web/tests/qa/toursFixtureAuthority.test.ts` | R3: 84 + 42 synthetic cases | `typecheck:tests` |

**Fixture data** (marker `metadata.qa_fixture = "tours_location_only_v1"`). Revision 2: the persona org `qa_shared`, site
`qa_north`. Every "Lakeside" below reads as `qa_north`:

| Gap | Rows | Written by |
|---|---|---|
| G-T2 | 1 organization-wide tour rule, Thu 13:00–14:00 America/Los_Angeles, 30 min, capacity 1 | product `createTourSchedule` (scope `locationId: null`); marker added beside its schedule identity |
| G-T2 | person (`legacy.pending@tours-cert.alloy.invalid`, no phone), household, membership, opportunity at Lakeside | direct rows, the canonical lead seed's shape |
| G-T2 | 1 `pending_approval` booking at the next Thursday 13:00, `metadata.slot_capacity: 1` | direct row — historical data; the product booking writer correctly refuses a new booking on a legacy-only interval |
| G-T5 (R3) | the run's two forms A and B, each with one published version (intent `enrollment_lead`) | **product routes only**: `POST /api/admin/forms`, `POST …/[formId]/versions`, `POST …/versions/[versionId]/publish`, as the persona; the port keeps the new ids only |
| G-T5 | Lakeside links on the run's forms: form A ×2 (older, newer), form B ×1, form A ×1 withdrawn | **product route only**: `POST /api/admin/forms/[formId]/public-links`, `PATCH …/[linkId] {is_active:false}`. The port keeps the new link's id and drops the response, which carries the plaintext token |

### Expected output, per operation

| Operation | Lines (beyond ✓/✗ checks) | Meaning |
|---|---|---|
| `count` on an empty world | `census count=0`, `✓ retained_revoked_links=0`, `✓ retained_fixture_forms=0`, `✓ forms_owned_this_run=0` | baseline |
| `ensure` | `census count=9`, `✓ retained_revoked_links=1`, `✓ forms_owned_this_run=2`, `✓ forms_created_this_ensure=2`, `✓ form_versions_created_this_ensure=2`, `✓ form_versions_published_this_ensure=2`, `✓ retained_fixture_forms=2`, `✓ retained_fixture_form_versions=2`, every `g_t2_*` / `g_t5_*` ✓ | 9 live rows: rule, booking, person, household, membership, opportunity, 3 active links. The pre-withdrawn G-T5 link is the 1 retained revoked row |
| `count` after ensure | `census count=9`, `✓ retained_revoked_links=1` | read-only, fresh census |
| `reset` | `reset namespace=tours-cert.alloy.invalid removed=6`, `✓ links_revoked_this_reset=3`, `✓ retained_revoked_links=4`, `✓ retained_fixture_forms=2`, `✓ retained_fixture_form_versions=2` | `removed` is **physical deletions only**. Links are revoked, never deleted |
| `count` after reset | `census count=0`, `✓ retained_revoked_links=4` | — |

### Cleanup acceptance

`census count=0` means **no live fixture state**. It does **not** mean zero physical rows. Exactly **4 revoked
`form_public_links` rows remain**: marker `tours_location_only_v1`, `is_active=false`, at Lakeside. The product
offers no link deletion, and a fixture must not invent one or hand-delete token-bearing rows.

So acceptance is all of:
- `census count=0`;
- `retained_revoked_links=4`;
- `retained_fixture_forms=2` and `retained_fixture_form_versions=2` (R3: the run's forms, retained);
- no outbound residue.

A second reset is safe: `removed=0`, `links_revoked_this_reset=0`, `retained_revoked_links=4`. Removing the 4 revoked
rows, if ever wanted, is a separate product decision (a link-deletion capability), or goes away with the isolated
environment.

### Guards and boundaries

- **Before any port:**
  - exactly one registered argv;
  - `ALLOY_CERT_FIXTURE` / `ALLOY_CERT_NAMESPACE` match;
  - `ALLOY_QA_RUN_ID` is `qar_…`; `ALLOY_QA_ENVIRONMENT_ID` is `certenv-…`;
  - `SUPABASE_URL` is loopback http, and a service key is present;
  - no `RESEND_` / `SENDGRID_` / `POSTMARK_` / `MAILGUN_` / `SMTP_` / `TWILIO_` / `STRIPE_SECRET` /
    `INTERNAL_MESSAGES_PROCESS_URL` variable.
- **Before any ensure write:** 0 active `communication_provider_bindings` for the org. After ensure, outbound row counts
  must equal the baseline.
- **Reset** refuses before touching anything if the marker matches more than 200 rows, or if any outbound row is
  addressed into the namespace (residue is evidence for an operator, never deleted by a fixture). Every delete
  re-asserts the marker.
- **Output:** only `census …`, `reset …` and `✓/✗ <name>` lines; anything else becomes `✗ output_withheld`. Error text
  is never printed.
- **Never called:**
  - `confirmTourBooking`, `createTourBooking`;
  - orchestrators, enqueue, the queue trigger, calendar invites;
  - the `legacy_pending_confirmation` authority — the existing Tours source guard holding that boundary stays green.

  No real booking is confirmed by the fixture.

## 2. What local evidence proves — and what it does not

Local certification of the candidate (build, typecheck, focused tests on the exact committed tree) is recorded on the
sprint checkpoint, with receipts in the lane report. It proves:
- the runner's contract lines, guards, ownership, bounds, idempotency and partial-failure recovery against
  **synthetic ports**;
- the G-T2 and G-T5 shape checks through the product's own pure functions;
- that the module graph compiles and loads (the entry refuses with exit 2 before any I/O).

**Not proven by any local evidence:**
- real rows, constraints, triggers (`enforce_tour_booking_slot_capacity`, org-integrity validators), RLS;
- whether the `persons` / `customers` / `customer_persons` / `opportunities` inserts pass the seed world's triggers;
- whether the run's two forms' links come out lead-capture on a real database (`g_t5_two_forms_attachable` will say);
- the preview Forms routes (create / version / publish / link) accepting the QA session as `FORMS_AUTHOR`;
- any v2 record issued by a real executor: the installed entry is v1, so none exists yet (§9);
- the legacy confirmation path on a real database (T4), and the reschedule/new-booking refusals on real data (T5, T6);
- any outbound behaviour.

## 3. Isolated QA preflight — measured by 2026-10-31T01:49Z, read-only; NOT READY (historical; §10 supersedes the order)

Nothing was filed, renewed, activated or executed. These facts were read from the Gateway's state files, not from
the environment:

| Precondition | Measured | Ready? |
|---|---|---|
| Candidate | Revision 2 is uncommitted → then a new uncertified slice. The released checkpoint covers `4edb2ab3f` only, and that candidate is not executable under the installed executor (§0) | **no**: needs a new certified checkpoint |
| `certenv-3669337690` | `ready`, owner and holder `lane_2cea84351d90`, project `vac-certenv-3669337690` (not alloy-cert). Baseline staging `1045a8ce0794`, migration head `20261214090000`, no migration between it and the candidate | lease **EXPIRED** `2026-10-30T00:28:59Z` → `environment.renew_certification_lease` (approved by the user) |
| Preview `alloy.candidate.enrollment` | `FAILED`, serving `e94a48af3d87` on that environment | **no** → `product.activate_candidate_preview` with the new certified tip |
| QA run | none has ever been opened on `certenv-3669337690` | **no** → isolated `environment.qa_run_open`, plan `bp_v2`, persona `admin` (`qa_shared`, all sites). Its local structure ensure creates `qa_shared` and `qa_north`. Then `environment.restore_preview_qa_session` |
| G-T5 forms in the persona org | R3: the fixture authors its own two forms in `qa_shared` through the product routes (§R3) | closed locally (synthetic); real-route proof waits for the QA run |
| Outbound proof P1–P5 | not measured (needs the activated preview) | unknown |

### What the installed executor does and does not attest

- **Exact operation authority: supported.** A per-execution authority record, a live provenance request, the
  pinned script digest, exact-HEAD and clean-tree checks, atomic request-id claiming, and secret suppression on
  output.
- **Database identity: the Gateway resolves it, but it is not live-attested.** `resolveLocalTarget` takes the API
  port and keys from the environment's registry record. It refuses alloy-cert by project id, a foreign owner or
  holder, and an expired lease. It re-measures the run's bound schema identity (base sha, migration head). It
  does **not** probe which stack actually listens on that port. The child sees only a loopback URL, which proves
  nothing (§0).
- **Target hold: none.** The lease is checked at start and at finish (`binding_expired`). Nothing holds the
  environment against recycling, or against another writer, while the child runs.

### Missing contracts — for the parent; no platform dispatch from this lane

1. ~~G-T5 forms in the persona org~~ — decided and closed locally in R3 (the fixture's own forms, product routes).
2. **Trusted target attestation** — the product side is adopted in R3 (authority v2: database identity, API
   identity, target-hold disposition). The registration remains: the installed entry is v1 (§9).
3. **Vacilando #458** ("Preserve census authority and correct candidate build memory budgets") is **OPEN, not
   merged and not installed**. The installed `66f2d0dab2c7` equals vacilando `main`, so there is no receipt to
   verify.

### Order once 1–2 are decided (each step needs its own approval; old bindings are never re-run)

1. certify Revision 2: full Tier 1 on the exact tree → `vac sprint checkpoint` → `request-release`;
2. renew `certenv-3669337690` → activate the preview on the new tip → open the isolated `bp_v2` run → restore
   `admin`'s session (storage-state mtime after the filing);
3. P1–P5 outbound proof;
4. `vac certify-fixture tours_certification count|ensure|count …`, with `--candidate <new tip>` and
   `--script-sha256 6d58a56a…f996`, from this worktree with a clean tree;
5. T1–T6 (desktop 1440, phone 390). T4 only if step 3 passed;
6. reset → `removed=6`, `links_revoked_this_reset=3`, `retained_revoked_links=4`; count → `census count=0`.

Unchanged and not addressed here: immunization collection, enforcement and attendance decisions (objectives
`A1FB6D6FE461` / `A0442B8FAC97`); FI-12; QAV2-H1…H6.

## 9. Platform registration handoff (R3) — the platform bridge owns it; nothing here edits its repository

The installed `tours_certification` entry (toolkit `20261101-2aa8b30d6dd8`) has no `authority_contract`, `pins`,
`api_identity` or `required_org_key`. Until the platform registers them, the executor issues a v1 record and the
R3 runner refuses every execution (`fixture_authority_org_unbound`) — fail closed, by design.

**No new contract is needed.** The registration reuses the shape the installed toolkit already registers for a
persona-bound, preview-bound program:
- `financials_historical_draft`: `fixture_org: PERSONA_ORG`, `preview: true`, `authority_contract: "v2"`, `pins`
  (`schema: vacilando.isolated_fixture_pins.v2`, `variant: "program"`), `api_identity: "required"`;
- plus Surfaces' `required_org_key: "qa_shared"`.

The operations (`ensure` / `count` / `reset`, args and flags), the namespace, `reset_limit: 200` and `npm_script`
stay as installed.

The exact proposal is the immutable file **`/tmp/94e9-api-handoff/TOURS-V2-PRODUCT-HANDOFF.json`**, with a companion
`TOURS-V2-PRODUCT-HANDOFF.md` and `SHA256SUMS`. The JSON names the candidate commit, the script-body digest, each
required artifact's bytes at that commit (`git show <candidate>:<path>`), and the `programPinsDigest`. It is outside
the repository, so the pinned bytes never include their own pin. Any later product commit invalidates the pins and
needs a re-pin.

Registration and install gates, in order, none of them this lane's:
1. the platform registers the entry exactly as proposed (a platform change, reviewed by its owner);
2. the toolkit release containing it is installed on this host (governed install);
3. the candidate reaches the sprint's governance — either a new sprint or objective for the successor, or a
   Director decision on the existing one. A checkpoint on `EB9A9359C92B` supersedes `ick_9b21253d2610` and revokes
   `spr_56956aad3d1d`.

## 10. The eventual isolated QA packet (prepared, NOT run) — `certenv-3669337690` only

Target, as last recorded by the Gateway (every value is re-measured fresh before use, never trusted from here):
- environment `certenv-3669337690`, project `vac-certenv-3669337690` (never `alloy-cert`), owner and holder
  `lane_2cea84351d90`;
- API port `56130`, DB port `56131`;
- baseline staging `1045a8ce0794ce99e37074495b346237d99c4650`, 550 migrations, head `20261214090000`;
- the candidate adds no migration.

Decided: availability is **location-only**. Legacy organization-wide exposure is a separate rollout risk, not this
QA's. The Vercel Alloy preview is CANCELLED, whatever its status shows: the route is the existing local
`product.activate_candidate_preview` capability.

Mandatory fresh preflight (read-only, all before any filing; any mismatch stops the packet):
1. runtime identity — the environment record, project id, ports, and that `alloy-cert` is not the target;
2. schema — base sha, migration count and head, re-measured;
3. ownership and lease — owner/holder is this lane; the lease is current (it was EXPIRED; renewal needs its own
   approval);
4. target hold — clear, with a current revision;
5. session — the persona `admin` (`qa_shared`, all sites) session restored after the filing (check the
   storage-state mtime, not the cached success);
6. the installed registry shows `tours_certification` with `authority_contract: "v2"` and pins whose candidate is
   the one to execute (§9).

Sequence (each consequential step its own approval; old bindings are never re-run):
1. renew `certenv-3669337690`'s lease;
2. activate the candidate preview on the exact successor candidate;
3. open the isolated QA run (`bp_v2`, persona `admin`); its structure ensure creates `qa_shared` and `qa_north`;
4. restore the persona session;
5. outbound proof P1–P5: no active provider binding, no provider or queue environment, baseline counts. The real
   recipient set is empty by construction (`@tours-cert.alloy.invalid`, no phone);
6. run `vac certify-fixture tours_certification count`, then `ensure`, then `count`, with `--candidate <successor>`
   and `--script-sha256 6d58a56a…f996`, from this worktree, clean. Expected per §1: R3 lines, and every
   `g_t2_*` / `g_t5_*` ✓;
7. booking and form QA T1–T6 (desktop 1440, phone 390). T4 runs only if step 5 passed;
8. `reset`, then `count`. Accept only `removed=6`, `links_revoked_this_reset=3`, `retained_revoked_links=4`,
   `retained_fixture_forms=2`, `retained_fixture_form_versions=2`, `census count=0`, and no outbound residue. The QA
   run's own records are censused separately (§R3).

Not in this packet: renewal, activation, a new environment, credential or session grants, any live fixture run,
count or reset, an aggregate census, publication, merge, staging, or real notifications.

