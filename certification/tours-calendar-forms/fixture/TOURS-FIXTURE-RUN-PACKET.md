# Tours certification fixture — local runner and the later isolated QA packet

Sprint `OPWORK_2CEA84351D90_SPRINT_EB9A9359C92B`, branch `sprint/opwork_2cea84351d90_sprint_eb9a9359c92b`.

Slices on top of the certified candidate `e94a48af3d87` (not rewritten; its checkpoint `ick_93480ca46501` stays as
recorded and covers `e94a48af3d87` only):
- `tours-certification-fixture-runner` `110bcf84d`;
- `tours-fixture-retained-row-semantics` (the commit carrying this file).

**Candidate for the isolated run = the exact tip of the sprint's newest CERTIFIED checkpoint** (`vac sprint status`
names it; a file cannot carry its own commit id). The executor refuses any other HEAD or a dirty tree.

## 1. The runner (product side of the installed contract)

Installed toolkit `b3c80db2e9aa`, `lib/certification-fixture.mjs` → `tours_certification`:
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

**Fixture data** (marker `metadata.qa_fixture = "tours_location_only_v1"`, seed org `…0001`, location Lakeside `…0011`):

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

## 3. Isolated QA packet (prepared; nothing filed or executed)

**Environment readiness is UNKNOWN until an authorized check.** Last recorded:
- `certenv-3669337690`, lease EXPIRED 2026-10-30T00:28:59Z;
- containers were up at 2026-10-30 ~13:45Z per `alloy-stack status`, which says nothing about lease, seed or schema
  currency.

Nothing here measured or renewed it.

Order; each step needs its own approval:
1. **Readiness check (authorized):** lease state, seed world present (org `…0001`, Lakeside `…0011`, both named
   forms), schema at the candidate's migrations. If `certenv-3669337690` is retired, a new isolated environment is a
   separate authorization.
2. `environment.renew_certification_lease` `certenv-3669337690`.
3. `product.activate_candidate_preview`: target `alloy.candidate.enrollment`, `candidateSha` = the certified checkpoint
   tip, `databaseMode: isolated`, `previewMode: dev`.
4. An isolated `environment.qa_run_open` on that environment (not hosted), then
   `environment.restore_preview_qa_session` for the bound persona. Verify the storage-state mtime is after the
   filing; the fixture reads its loopback origin and cookies from it.
5. **Outbound proof (P1–P5), before any write:**
   - preview process env names carry no provider or queue-trigger variable;
   - no other process reads the certenv queue;
   - the org's tour internal recipients are `.invalid` / `example.com` only — required for T4.
   The fixture itself refuses on an active provider binding.
6. **Fixture**, from this worktree at the checkpoint tip, clean tree. Each request uses
   `--qa-run <qar_…> --persona <persona> --candidate <checkpoint tip> --script-sha256 6d58a56a52afc71eab3fb274c8bb5c88fe197001f5880dfe9bdf705e0825f996 --request-id <new id>`:
   - `vac certify-fixture tours_certification count …` → expect `census count=0`, `retained_revoked_links=0` (or the
     residue of an earlier run, recorded);
   - `vac certify-fixture tours_certification ensure …` → expect `census count=9`, `retained_revoked_links=1`, all
     G-T2/G-T5 ✓;
   - `vac certify-fixture tours_certification count …` → a fresh census (the executor's freshness contract).
7. **Tests T1–T6** on the preview (desktop 1440, phone 390), from `TOURS-FIXTURE-PACKET.md` §5:
   - T1: Lakeside offers no slots from the legacy rule;
   - T3: Attach a form shows 2 forms, A on its newest link, the withdrawn link blocked;
   - T4: confirm the legacy pending booking — **only if step 5 passed**. Expect status the only change and no
     delivered message. This is the real `legacy_pending_confirmation` proof;
   - T5: reschedule → refused;
   - T6: new booking at that interval → refused.
8. **Reset:**
   - `… reset …` → `removed=6` (T4 changes only the booking's status, so it is still one of the 6),
     `links_revoked_this_reset=3`, `retained_revoked_links=4`;
   - then `… count …` → `census count=0`, `retained_revoked_links=4`;
   - any outbound residue stops the reset for an operator.

Unchanged and not addressed here: immunization collection, enforcement and attendance decisions (objectives
`A1FB6D6FE461` / `A0442B8FAC97`); FI-12; QAV2-H1…H6.
