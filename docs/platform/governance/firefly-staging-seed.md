---
owner: platform
status: canonical
last_reviewed: 2026-11-25
supersedes: []
---

# Firefly staging seed (ALY-14 E2)

One repeatable command builds a **Firefly Early Learning staging school** — the live tenant's
configuration with synthetic families — in a designated database, and proves in that database that it
wrote nothing outside its own organization.

| | |
|---|---|
| Organization | **Firefly Early Learning (Staging)** · `f17e0000-0000-4000-8000-000000000001` · slug `firefly-early-learning-staging` |
| Never written | the live Firefly tenant `93667019-bd28-49b5-a688-acc9bb1e0a19`, every other org, `auth`, `storage`, every global row |
| Source | `web/lib/staging/fireflyStagingSeed/` (dataset, renderer, fence, audit, targets, verification) |
| Committed SQL | `supabase/seed/firefly_staging_seed.sql`, `supabase/seed/firefly_staging_verify.sql` (generated; a test fails if hand-edited) |
| Command | `cd web && npm run staging:seed:firefly -- <plan \| render \| check \| apply \| verify>` |
| Tests | `cd web && npx vitest run tests/staging/fireflyStagingSeed.test.ts` (offline) · `npm run staging:seed:firefly:prove` (throwaway database) |

Out of scope by design: **no identities** (no `auth.users`, `user_roles`, access profiles) and
Firefly is **not** a QA target. Both are E3, after E1 and E2 are accepted.

## What it seeds

**Configuration, mirrored from the live tenant's census evidence (configuration only, no rows copied):**

- 3 campuses — North, South, West — and their 17 rooms with Firefly's capacity, ratio and age group
  (`certification/locations/legacy-capacity-convergence-census.sql.results.json`). Rooms are `unit`
  locations under their campus; capacity lives in `locations.metadata`, as on the live tenant.
- Programs infant, toddler, preschool, pre-K and school age at every campus; kindergarten at North.
- 8 offerings, 28 day-count variants, and one monthly private-pay org-default rate each, from Firefly's
  rate card (`certification/financials/11a-fx/plans.json`,
  `web/tests/fixtures/commercial/stagingToddlerPreschoolCatalog.json`). School-age rates for 2–4 days
  are interpolated between the census's 1-day and 5-day values.
- Charge templates `registration_fee` ($75 per child, fixed) and `tuition` (`rate_derived`).
- Department `enrollment` whose business process is the **platform's own Enrollment template**
  (`buildEnrollmentTemplateStageRecords`) with fixed stage ids, four family-grain work views and
  declared entry points; it passes `validateBusinessProcessForPublish` (tested). Work units
  `new_leads`, `enrollment_pipeline`, `tours` carry the representative seed's queue definitions verbatim.
- The household role vocabulary (`parent`, `guardian`, …).

**Synthetic families:** 60 households, 100 guardians, 75 children across every stage — 14 lead,
8 tour (tours booked in the week after the anchor), 5 decision, 7 waitlist, 5 enrolling, 12 enrolled,
6 closed (lost), 3 closed/withdrawn. A quarter of households bring siblings; a third have one guardian.
Every child's date of birth fits their program. Surnames are trees ("Alder Family", "Aspen Family", …),
emails are `first.surname@firefly-staging.invalid`, phones are the NANP fictional `555-01XX` block —
all of which the ALY-14 outbound guard already treats as test recipients (tested), so nothing seeded
can reach a real inbox or phone.

QA debris on the live tenant (`stage4_ok3_*` categories, North rate overrides, `Cert Enrollment/Consent`
forms) is deliberately absent.

**Deterministic:** no clock and no randomness. Every date is an offset from `SEED_ANCHOR_DATE`
(2026-11-02) and every id is in the `f17e0000-0000-4000-8000-…` namespace. Changing the anchor is a
reviewed re-baseline.

## Prerequisites

- A database at the current migration head (the seed refuses if `childcare` is missing).
- A role that bypasses RLS — the fence must see every row (the seed refuses otherwise). The shared
  stack's `postgres` qualifies.
- **Local:** the shared stack up — `alloy-stack use` (never `supabase start`). A host `psql` is used
  if present; otherwise the stack's own `supabase_db_alloy-cert` container psql, as
  `certification/alloy-certify` does.
- **Staging:** a host `psql`, `ALLOY_ENVIRONMENT=staging`, `FIREFLY_STAGING_SEED_DATABASE_URL` naming
  project `ikaxilmwmrmbagoidedu`, and the ref re-typed with `--confirm-project-ref`. The URL is an
  operator-held credential; it is never committed and never printed (passwords are masked).

## Commands

```bash
cd web
npm run staging:seed:firefly -- plan              # what would be written; no connection
npm run staging:seed:firefly -- check             # committed SQL == renderer, audit passes
npm run staging:seed:firefly -- render            # after a dataset change; commit the result

npm run staging:seed:firefly -- apply  --target local
npm run staging:seed:firefly -- verify --target local

ALLOY_ENVIRONMENT=staging FIREFLY_STAGING_SEED_DATABASE_URL='postgresql://…' \
  npm run staging:seed:firefly -- apply --target staging --confirm-project-ref ikaxilmwmrmbagoidedu
```

`apply` runs the seed and then the verification census; it exits non-zero on any refusal, fence
breach or failed check.

## Safety — every layer, in order

1. **Target resolution** (`targets.ts`, before connecting). Only `local` (loopback hosts) and
   `staging` (project `ikaxilmwmrmbagoidedu`, fully declared) resolve. The production ref anywhere in
   the URL, any other host, an undeclared environment or a missing confirmation is a refusal.
2. **Committed-file check + static audit** (`auditSql.ts`, before connecting). The file must equal the
   renderer's output, write only its 18-table write set in `public`, contain no DELETE / TRUNCATE /
   DROP / ALTER / GRANT / bare UPDATE / psql include / auth or storage write / clock value, use only
   seed-namespace uuids, and name the live Firefly org exactly once — in the refusal below.
3. **In-database preflight.** Refuses without a runner-set `seed_target`; refuses a role that RLS
   filters; refuses a database without `childcare`; refuses if the seed's id or slug belongs to
   another org; refuses a `local` target that contains the live Firefly tenant (it is not the local stack).
4. **The fence.** One `REPEATABLE READ` transaction. Before writing, it counts every row outside the
   seed org in every table of `public`, `auth` and `storage`. After writing it recounts and counts the
   rows this transaction wrote (`age(xmin) <= 0`) outside the seed org. Any difference — including
   one made by a trigger — raises, and the whole seed rolls back. A successful run prints
   `fence held — N tables, 0 rows changed outside org …`.
5. **Writes are upserts with fixed values.** Re-applying converges every seeded row back to its known
   state; it never duplicates and never deletes. Rows staff create inside the staging school later are
   left alone.

## Verification and repeatability

`verify` is read-only (`BEGIN READ ONLY … ROLLBACK`) and prints one line per check — expected values
are derived from the dataset, never typed — plus a fingerprint of every seeded row's business columns (output shape, illustrative values):

```text
PASS  households            expected 60  actual 60
PASS  stage_lead            expected 14  actual 14
PASS  guardian_email_not_reserved  expected 0  actual 0
PASS  known_first_family    expected Alder Family/lead/open  actual …
fingerprint 3b1f…
```

**Repeatability proof:** `apply` → `verify` → `apply` → `verify`. Every check passes both times and the
two fingerprints are identical.

## The in-database proof (throwaway database)

`npm run staging:seed:firefly:prove` (`scripts/fireflyStagingSeedProof.ts`,
`lib/staging/fireflyStagingSeed/scratchProof.ts`) drives the real command against a **throwaway** database
and prints one PASS/FAIL line per proof; it exits 1 on any FAIL:

1. Plants the two **ZZ Alloy QA** orgs and their registry sites by their real ids (`lib/qa/sharedQaRegistry.ts`)
   if absent, then hashes every row of every org-scoped `public` table they own.
2. `apply` twice — both must be clean (fence held, every check PASS) with one fingerprint.
3. Counts **every** row in the seed org (not only seed ids, so a duplicate cannot hide) against the dataset,
   per table and per stage.
4. Relationship checks, each a count of broken links that must be 0: rooms under a seed campus (never a ZZ
   site), guardians/children/cases/contacts/participations all inside one household in the seed org, and
   every household has its case.
5. Drift: hand-edits a seeded household's name; `verify` must fail with a new fingerprint; `apply` must
   restore the known value and the original fingerprint.
6. The ZZ hash must be byte-identical after all of it.

It refuses anything but a loopback database named `firefly_seed_scratch*`, because it writes (the ZZ plant
and the drift edit). It is a command, not a vitest live suite: `web/vitest.config.ts` excludes every live
suite unless the governed isolated executor admits it (`tests/harness/liveSuiteAuthority.mjs`).

Make the scratch database **inside the shared `alloy-cert` cluster** (no new containers; never
`supabase start`), cloned from the stack's migrated `postgres` so the fence has real other-org rows to
protect, and drop it afterwards:

```bash
docker exec supabase_db_alloy-cert sh -c \
  'createdb -U supabase_admin firefly_seed_scratch && pg_dump -U supabase_admin postgres | psql -U supabase_admin -q firefly_seed_scratch'
#   expected noise: pg_cron cannot be created outside `postgres`, and a few FK rows a concurrent writer
#   changed mid-dump; neither touches the seed's tables.

cd web
FIREFLY_STAGING_SEED_SCRATCH_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54422/firefly_seed_scratch \
  npm run staging:seed:firefly:prove

docker exec supabase_db_alloy-cert dropdb -U supabase_admin firefly_seed_scratch
```

**Measured 2026-11-25** on a scratch clone of `alloy-cert` (133 orgs, many `ZZ …` cert orgs): all 41
proofs passed — fence held over 355 tables with 0 rows changed outside the seed org on each apply,
fingerprint `74d954c523fcc1b45ea7736ac6493a6c` on every clean apply (the same on two separate clones), 329 ZZ Alloy QA rows across 272 tables
byte-identical. A one-field edit to a ZZ row changes the ZZ hash (sensitivity checked by hand).

## Known gaps

- **Run against a local throwaway database only.** Not yet applied to hosted staging (an operator step
  with the staging credential), and not applied to the shared stack's own `postgres` (other sessions'
  fixtures live there; the proof uses a scratch clone instead).
- **Fence cost and reach on hosted staging are unmeasured.** It counts every table in `public`, `auth`
  and `storage` twice; if the staging role cannot read a table there, the seed refuses (fails closed)
  rather than skipping it. A trigger that writes a global or other-org row is a breach by design.
- **Control-plane baseline.** Historic migrations seeded org-scoped field definitions, layouts, option
  sets and status definitions for the orgs that existed *at migration time*. A new org on a migrated
  database gets only what `orgs_seed_default_rbac` provides. The representative seed replays those
  migrations; this seed cannot — on staging a replay would rewrite every childcare tenant, and the
  fence would roll it back. Which of those rows the staging school's surfaces need is still unmeasured
  (the local runs proved data, not rendered surfaces); close it through an org-scoped provisioning path.
- **Business process is the platform template, not Firefly's published revision 59** (7 stages incl.
  `offered`, 8 work views, placeholder tour outcomes). Reproducing rev 59 needs a configuration-only
  export of its payload.
- Not seeded: Catalog items (`commercial_products`), revenue categories / GL accounts, forms and the
  enrollment packet, process instances, open work items, tour bookings (tour dates live on the case
  metadata only), and the four other departments.
