# Tours certification fixture — local runner and the later isolated QA packet

Sprint `OPWORK_2CEA84351D90_SPRINT_EB9A9359C92B`, branch `sprint/opwork_2cea84351d90_sprint_eb9a9359c92b`.

Slices on top of the certified candidate `e94a48af3d87` (not rewritten; its checkpoint `ick_93480ca46501` stays as
recorded and covers `e94a48af3d87` only):
- `tours-certification-fixture-runner` `110bcf84d`;
- `tours-fixture-retained-row-semantics` `4edb2ab3f` — certified and RELEASED as checkpoint `ick_3875476a8108`
  (release `spr_b40e4abbc674`). It is kept as the **prior revision**: not rewritten, and not executable under the
  installed executor (§0);
- `tours-fixture-a741-persona-binding` (the commit carrying this revision) — NOT certified; needs its own checkpoint.

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
| `web/tests/qa/toursCertificationFixture.test.ts` | 35 synthetic cases | `typecheck:tests` |

**Fixture data** (marker `metadata.qa_fixture = "tours_location_only_v1"`). Revision 2: the persona org `qa_shared`, site
`qa_north`. Every "Lakeside" below reads as `qa_north`:

| Gap | Rows | Written by |
|---|---|---|
| G-T2 | 1 organization-wide tour rule, Thu 13:00–14:00 America/Los_Angeles, 30 min, capacity 1 | product `createTourSchedule` (scope `locationId: null`); marker added beside its schedule identity |
| G-T2 | person (`legacy.pending@tours-cert.alloy.invalid`, no phone), household, membership, opportunity at Lakeside | direct rows, the canonical lead seed's shape |
| G-T2 | 1 `pending_approval` booking at the next Thursday 13:00, `metadata.slot_capacity: 1` | direct row — historical data; the product booking writer correctly refuses a new booking on a legacy-only interval |
| G-T5 | Lakeside links: form A ×2 (older, newer), form B ×1, form A ×1 withdrawn | **product route only**: `POST /api/admin/forms/[formId]/public-links`, `PATCH …/[linkId] {is_active:false}`. The port keeps the new link's id and drops the response, which carries the plaintext token |

### Expected output, per operation

| Operation | Lines (beyond ✓/✗ checks) | Meaning |
|---|---|---|
| `count` on an empty world | `census count=0`, `✓ retained_revoked_links=0` | baseline |
| `ensure` | `census count=9`, `✓ retained_revoked_links=1`, every `g_t2_*` / `g_t5_*` ✓ | 9 live rows: rule, booking, person, household, membership, opportunity, 3 active links. The pre-withdrawn G-T5 link is the 1 retained revoked row |
| `count` after ensure | `census count=9`, `✓ retained_revoked_links=1` | read-only, fresh census |
| `reset` | `reset namespace=tours-cert.alloy.invalid removed=6`, `✓ links_revoked_this_reset=3`, `✓ retained_revoked_links=4` | `removed` is **physical deletions only**. Links are revoked, never deleted |
| `count` after reset | `census count=0`, `✓ retained_revoked_links=4` | — |

### Cleanup acceptance

`census count=0` means **no live fixture state**. It does **not** mean zero physical rows. Exactly **4 revoked
`form_public_links` rows remain**: marker `tours_location_only_v1`, `is_active=false`, at Lakeside. The product
offers no link deletion, and a fixture must not invent one or hand-delete token-bearing rows.

So acceptance is all of:
- `census count=0`;
- `retained_revoked_links=4`;
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
- whether the two seed forms' links come out lead-capture (`g_t5_two_forms_attachable` will say);
- the preview Forms routes accepting the QA session;
- the legacy confirmation path on a real database (T4), and the reschedule/new-booking refusals on real data (T5, T6);
- any outbound behaviour.

## 3. Isolated QA preflight — measured by 2026-10-31T01:49Z, read-only; NOT READY

Nothing was filed, renewed, activated or executed. These facts were read from the Gateway's state files, not from
the environment:

| Precondition | Measured | Ready? |
|---|---|---|
| Candidate | Revision 2 is uncommitted → then a new uncertified slice. The released checkpoint covers `4edb2ab3f` only, and that candidate is not executable under the installed executor (§0) | **no**: needs a new certified checkpoint |
| `certenv-3669337690` | `ready`, owner and holder `lane_2cea84351d90`, project `vac-certenv-3669337690` (not alloy-cert). Baseline staging `1045a8ce0794`, migration head `20261214090000`, no migration between it and the candidate | lease **EXPIRED** `2026-10-30T00:28:59Z` → `environment.renew_certification_lease` (approved by the user) |
| Preview `alloy.candidate.enrollment` | `FAILED`, serving `e94a48af3d87` on that environment | **no** → `product.activate_candidate_preview` with the new certified tip |
| QA run | none has ever been opened on `certenv-3669337690` | **no** → isolated `environment.qa_run_open`, plan `bp_v2`, persona `admin` (`qa_shared`, all sites). Its local structure ensure creates `qa_shared` and `qa_north`. Then `environment.restore_preview_qa_session` |
| G-T5 forms in the persona org | the two lead-capture forms (`Northwind Tour Inquiry`, `QA V2 Inquiry`) were made in the seed org. Nothing provisions them in `qa_shared`, and the fixture does not create forms | **no**: ensure will refuse `✗ forms_missing` before any link. This is a missing contract (below) |
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

1. **G-T5 forms in the persona org.** Either the fixture creates two marker-owned lead-capture forms through the
   product routes (`POST /api/admin/forms` → `/versions` → `/publish`, as the persona; a fixture scope change with
   new retained-row semantics), or a QA-world provisioning step creates them in `qa_shared`. A decision.
2. **Trusted target attestation** (same gap as Analytics Northlead G2b): a live listener-to-project identity for the
   environment's API/DB port, and a hold disposition for the length of the execution.
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
