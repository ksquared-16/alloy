# Tours certification fixture — local runner slice and the later governed run packet

Sprint `OPWORK_2CEA84351D90_SPRINT_EB9A9359C92B` · slice `tours-certification-fixture-runner` on
`sprint/opwork_2cea84351d90_sprint_eb9a9359c92b`, on top of the certified candidate `e94a48af3d87` (not rewritten).
**Checkpoint `ick_93480ca46501` certifies `e94a48af3d87` only; it does not cover this slice's bytes.** A new
integration checkpoint is required before any release.

## 1. What this slice adds (product side of the installed contract)

Installed toolkit `b3c80db2e9aa`, `lib/certification-fixture.mjs` → `tours_certification`:
- `qa_bound`, `npm_script: "dev:qa:tours-fixture"`, ops `ensure` (`--ensure`), `count` (`--count`, census),
  `reset` (`--reset`);
- `reserved_namespace: "tours-cert.alloy.invalid"`, `reset_limit: 200`;
- executor: `npm run --silent dev:qa:tours-fixture -- <op>` in `<worktree>/web`, with a from-scratch environment.

| File | Role |
|---|---|
| `web/package.json` | `"dev:qa:tours-fixture": "tsx --tsconfig tsconfig.json scripts/qaToursFixture.ts"` — script-body pin **`6d58a56a52afc71eab3fb274c8bb5c88fe197001f5880dfe9bdf705e0825f996`** (the toolkit's `scriptBodyDigest`) |
| `web/scripts/qaToursFixture.ts` | entry; loads no `.env` |
| `web/lib/qa/toursFixture/toursCertificationFixture.ts` | guards, plans, ownership, bounds, verification, secret-safe output (pure, port-injected) |
| `web/lib/qa/toursFixture/toursCertificationFixturePorts.ts` | real ports: isolated DB (service role, loopback only) + the preview's Forms routes as the QA persona |
| `web/tests/qa/toursCertificationFixture.test.ts` | 35 synthetic cases |

**Fixture data** (marker `metadata.qa_fixture = "tours_location_only_v1"`, seed org `…0001`, location Lakeside `…0011`):

| Gap | Rows | Written by |
|---|---|---|
| G-T2 | 1 organization-wide tour rule, Thu 13:00–14:00 America/Los_Angeles, 30 min, capacity 1 | product `createTourSchedule` (scope `locationId: null`), marker added beside its schedule identity |
| G-T2 | person (`legacy.pending@tours-cert.alloy.invalid`, no phone), household, membership, opportunity at Lakeside | direct rows, the canonical lead seed's shape |
| G-T2 | 1 `pending_approval` booking at the next Thursday 13:00, `metadata.slot_capacity: 1` | direct row — historical data. The product booking writer correctly refuses a new booking on a legacy-only interval |
| G-T5 | Lakeside links: form A ×2 (older, newer), form B ×1, form A ×1 withdrawn | **product route only**: `POST /api/admin/forms/[formId]/public-links`, `PATCH …/[linkId] {is_active:false}`. The port keeps the new link's id and drops the response, which carries the plaintext token |

Forms A and B are the seed world's `"Northwind Tour Inquiry"` and `"QA V2 Inquiry"`, resolved by exact title. Ensure
refuses if either is missing or ambiguous.

**Operations.**
- `--ensure`:
  - seed world present;
  - **0 active `communication_provider_bindings` for the org**, else refuse before any write;
  - outbound row baseline;
  - find-or-create each piece (re-runnable after a partial failure);
  - outbound counts must equal the baseline afterwards;
  - verify the shape, then `census count=9`.
- `--count`: read-only. `census count=<n>`, plus ✓/✗ for G-T2 and G-T5 re-derived through `tourRulesForLocation`,
  `projectTourCalendarShareLinks` and `tourCalendarAttachOptions`. Absent fixture → `census count=0`, exit 0.
- `--reset`:
  - refuses before touching anything if the marker matches more than 200 rows, or if any outbound row is addressed
    into the namespace (residue is evidence for an operator, never deleted by a fixture);
  - deletes in dependency order (booking, links, rules, family), each delete re-asserting the marker;
  - **links are withdrawn through the product PATCH and retained revoked**, since the product has no link deletion;
    they leave the census;
  - prints `reset namespace=tours-cert.alloy.invalid removed=<n>`.
- **Guards, before any port:** exactly one registered argv; `ALLOY_CERT_FIXTURE`/`ALLOY_CERT_NAMESPACE` match;
  `ALLOY_QA_RUN_ID` `qar_…`; `ALLOY_QA_ENVIRONMENT_ID` `certenv-…`; `SUPABASE_URL` loopback http; service key
  present; no `RESEND_`/`SENDGRID_`/`POSTMARK_`/`MAILGUN_`/`SMTP_`/`TWILIO_`/`STRIPE_SECRET`/
  `INTERNAL_MESSAGES_PROCESS_URL` variable.
- **Output:** only `census …`, `reset …` and `✓/✗ <name>` lines. Any other line is replaced by `✗ output_withheld`.
  Error text is never printed.
- **Never called:** `confirmTourBooking`, `createTourBooking`, orchestrators, enqueue, the queue trigger and calendar
  invites (source-guarded). The `legacy_pending_confirmation` authority is not invoked; the existing Tours source
  guard holding that boundary stays green.

## 2. Local evidence (synthetic — NOT integrated DB proof)

- `tests/qa/toursCertificationFixture.test.ts` 35/35, plus the Tours suites (`tourLegacyPendingConfirmation`,
  `tourLocationOnlyAvailability`, `toursFeedbackLocationScope`, `toursPolishP1`, `publicBrand`): **104/104**.
- Four planted regressions → 8 failures, all restored:
  - link order swapped;
  - provider-binding guard removed;
  - reset bound removed;
  - output filter removed.
- An existing Tours authority source guard caught a first draft that passed `legacy_pending_confirmation`; fixed in the
  fixture, the guard unchanged.
- Real npm wiring: `npm run --silent dev:qa:tours-fixture -- --count` with an empty env → `✗ refused_fixture_mismatch`,
  exit 2. `--reset` with a hosted URL → `✗ refused_isolated_database_required`, exit 2. Both module graphs load and
  refuse before any I/O.
- `vac run typecheck` PASSED (`req_1793369329327063_12004`); `vac run typecheck:tests` PASSED
  (`req_1793369338931243_16302`), tree `df59eaa7cc239a53`.

**Not proven:**
- any real row, trigger, RLS or route behaviour;
- whether the seed forms' links are lead-capture (the `g_t5_two_forms_attachable` check will say);
- whether the `verticals` / `customers` / `persons` inserts satisfy every database trigger in the isolated seed world.

## 3. Later governed packet (prepared; nothing filed or executed)

Order; each step needs its own approval.

1. **New checkpoint:** full Tier 1 on the exact Tours tip containing this slice, then `vac sprint checkpoint`.
   `ick_93480ca46501` is not reused for these bytes.
2. **Isolated environment:** `environment.renew_certification_lease` `certenv-3669337690`. Its lease expired
   2026-10-30T00:28:59Z; if it is retired instead, a new isolated environment is a separate authorization.
3. **Preview:** `product.activate_candidate_preview` target `alloy.candidate.enrollment`, `candidateSha` = the new tip,
   `databaseMode: isolated`, `previewMode: dev`.
4. **QA run and session:** an isolated `environment.qa_run_open` on that environment (not hosted), then
   `environment.restore_preview_qa_session` for the bound persona. Verify the storage-state mtime is after the filing;
   the fixture reads its loopback origin and cookies.
5. **Outbound proof before any write (P1–P5):**
   - preview process env names carry no provider or queue-trigger variable;
   - no other process reads the certenv queue;
   - the org's tour internal recipients are `.invalid`/`example.com` only. This one is for test T4, which the fixture
     never runs;
   - the fixture itself refuses on an active provider binding.
6. **Fixture**, from this worktree at the new tip, clean tree, in this order:
   - `vac certify-fixture tours_certification count --qa-run <qar_…> --persona <persona> --candidate <tip sha>
     --script-sha256 6d58a56a52afc71eab3fb274c8bb5c88fe197001f5880dfe9bdf705e0825f996 --request-id <new id>`
     → baseline, expected `census count=0`;
   - `… ensure …` → expected `census count=9`, all `g_t2_*` / `g_t5_*` ✓;
   - `… count …` → a fresh census (the executor's freshness contract).
7. **Tests T1–T6** on the preview (desktop 1440, phone 390), from `TOURS-FIXTURE-PACKET.md` §5:
   - T1 Lakeside: no slots from the legacy rule;
   - T3 Attach a form: 2 forms, A on its newest link, the withdrawn link blocked;
   - T4 confirm the legacy pending booking (**only if** step 5 passed; expect status the only change, no delivered
     message);
   - T5 reschedule → refused;
   - T6 new booking at that interval → refused.
8. **Reset:** `… reset …` → `reset namespace=tours-cert.alloy.invalid removed=<n ≤ 200>`, then `… count …` → `census
   count=0`. Withdrawn links remain revoked rows by design. Any outbound residue stops the reset for an operator.

Unchanged and not addressed here: immunization collection, enforcement and attendance decisions (objectives
`A1FB6D6FE461` / `A0442B8FAC97`); FI-12; QAV2-H1…H6.
