---
owner: platform
status: canonical
last_reviewed: 2026-11-25
supersedes: []
---

# Firefly staging seed (ALY-14 E2)

One repeatable command seeds synthetic, known families into the **existing Firefly Early Learning org**
— the only staging school — in a designated database, and proves in that database that it changed no
row but its own seed rows.

| | |
|---|---|
| Organization | the existing **Firefly** tenant `93667019-bd28-49b5-a688-acc9bb1e0a19` (already on hosted staging, project `ikaxilmwmrmbagoidedu`). The seed **creates no org**: it refuses a database without this one. |
| Seed rows | ids in the `f17e0000-0000-4000-8000-…` namespace, inside the Firefly org, in the 17 write-set tables below |
| Never written | any org row (Firefly's included), the tenant's own rows inside Firefly, every other org (ZZ Alloy QA included), `auth`, `storage`, every global row |
| Source | `web/lib/staging/fireflyStagingSeed/` (dataset, renderer, fence, audit, targets, verification) |
| Committed SQL | `supabase/seed/firefly_staging_seed.sql`, `supabase/seed/firefly_staging_verify.sql` (generated; a test fails if hand-edited) |
| Command | `cd web && npm run staging:seed:firefly -- <plan \| render \| check \| apply \| verify>` |
| Tests | `cd web && npx vitest run tests/staging/fireflyStagingSeed.test.ts` (offline) · `npm run staging:seed:firefly:prove` (throwaway database) |

Out of scope by design: **no identities** (no `auth.users`, `user_roles`, access profiles) and
Firefly is **not** a QA target. Both are E3 — see [`firefly-staging-qa-profile.md`](firefly-staging-qa-profile.md),
which also carries the read-only pre-apply census of the tenant's real keys
(`supabase/seed/firefly_staging_tenant_census.sql`).

**No additional tenants.** The first version of this seed created a separate org, *Firefly Early Learning
(Staging)* (`f17e0000-0000-4000-8000-000000000001`). On hosted staging, which already holds Firefly, that
was a second Firefly tenant; it was never applied there, and it is retired. The seed now refuses any
database that holds that org rather than writing beside it, and its verification fails if any org in the
seed namespace exists.

## Where it writes: the tenant's configuration, the seed's families

Configuration is the tenant's. Each area is gated, in-transaction, on what the Firefly org already has
of its own (rows outside the seed namespace):

| Gate | The seed authors it only when the org has… | Otherwise the seed… |
|---|---|---|
| `seed_campuses` | no active site | places each family at one of the tenant's active sites (in a fixed order: primary first, then location number, label, id — the seed's North / South / West take them in turn, wrapping if there are fewer than three), and each child at the tenant's program category of that key at that site, or none |
| `seed_enrollment` | no `lead_management` department (Firefly's lifecycle department, `lib/staging/fireflyStagingSeed/lifecycleTarget.ts`) | puts each family case in that department's active `lifecycle_wu_<stage>` work unit. It **refuses** unless the department's `lifecycle_builder_v1` active process is `enrollment` and every open seeded stage (lead, tour, decision, waitlist, enrolling, enrolled) has an active queue. Closed cases get a queue only if one exists. Firefly's process-less `enrollment`-keyed department is never bound to |
| `seed_catalog` | no program offering and no charge template | writes no offering, variant, rate or charge template |
| `seed_role_types` | none of the six household role keys | writes no role type (verification then checks the roles seeded households name exist in the tenant's vocabulary) |

**On hosted staging every gate is closed**, so only synthetic families are written — 60 households and
their guardians, children, cases and participations — inside the tenant's own campuses, programs and
Enrollment department. The tenant's process, work units, catalog and records are read, never written.
On a **bare** Firefly org (a fresh local database, where the proof plants only the org row) every gate
is open and the seed authors the configuration described next. The run prints which:
`seed authors — campuses: false  enrollment: false  catalog: false  roles: false`.

Record numbers (`customer_number`, `person_number`, `opportunity_number`, `location_number`) are left
to the platform's own allocator (`MAX + 1` per org), exactly as for a real inquiry; an upsert never
renumbers. A reserved high block was rejected because the allocator would then continue the tenant's
real numbering from it.

## What it seeds

**Configuration — on a bare Firefly org only (see the gates) — mirrored from the live tenant's census
evidence (configuration only, no rows copied):**

- 3 campuses — North, South, West — and their 17 rooms with Firefly's capacity, ratio and age group
  (`certification/locations/legacy-capacity-convergence-census.sql.results.json`). Rooms are `unit`
  locations under their campus; capacity lives in `locations.metadata`, as on the live tenant.
- Programs infant, toddler, preschool, pre-K and school age at every campus; kindergarten at North.
- 8 offerings, 28 day-count variants, and one monthly private-pay org-default rate each, from Firefly's
  rate card (`certification/financials/11a-fx/plans.json`,
  `web/tests/fixtures/commercial/stagingToddlerPreschoolCatalog.json`). School-age rates for 2–4 days
  are interpolated between the census's 1-day and 5-day values.
- Charge templates `registration_fee` ($75 per child, fixed) and `tuition` (`rate_derived`).
- Department keyed `lead_management` (named Enrollment) whose business process is the **platform's own Enrollment template**
  (`buildEnrollmentTemplateStageRecords`) with fixed stage ids, four family-grain work views and
  declared entry points; it passes `validateBusinessProcessForPublish` (tested). Work units
  `new_leads`, `enrollment_pipeline`, `tours` carry the representative seed's queue definitions verbatim.
- The household role vocabulary (`parent`, `guardian`, …).

**Synthetic families (always):** 60 households, 100 guardians, 75 children across every stage — 14 lead,
8 tour (tours booked in the week after the anchor), 5 decision, 7 waitlist, 5 enrolling, 12 enrolled,
6 closed (lost), 3 closed/withdrawn. A quarter of households bring siblings; a third have one guardian.
Every child's date of birth fits their program. Surnames are trees, and every name the application
shows carries the visible marker `[Staging seed]` (ALY-14 E3): households read `Alder Family [Staging seed]`,
cases `[Staging seed] Alder Family — Ada`, children `Ada Alder [Staging seed]`. Guardians keep plain names
(they are only ever shown inside their marked household). Emails are `first.surname@firefly-staging.invalid`, phones are the NANP fictional `555-01XX` block —
all of which the ALY-14 outbound guard already treats as test recipients (tested), so nothing seeded
can reach a real inbox or phone.

QA debris on the live tenant (`stage4_ok3_*` categories, North rate overrides, `Cert Enrollment/Consent`
forms) is deliberately absent.

**Deterministic:** no clock and no randomness. Every date is an offset from `SEED_ANCHOR_DATE`
(2026-11-02) and every id is in the `f17e0000-0000-4000-8000-…` namespace. Changing the anchor is a
reviewed re-baseline.

## Prerequisites

- A database at the current migration head that **already holds the Firefly org** — hosted staging
  does; a local database does not (the shared stack's `postgres` has no Firefly, so `apply --target
  local` against it refuses, and that is intended: the seed creates no tenant). Locally, use the
  throwaway proof below, which plants the Firefly org row by its real id.
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
breach or failed check. Before a staging apply, `plan` and the gate line are the review surface: on
staging the gate line must read `false` for all four.

## Safety — every layer, in order

1. **Target resolution** (`targets.ts`, before connecting). Only `local` (loopback hosts) and
   `staging` (project `ikaxilmwmrmbagoidedu`, fully declared) resolve. The production ref anywhere in
   the URL, any other host, an undeclared environment or a missing confirmation is a refusal.
2. **Committed-file check + static audit** (`auditSql.ts`, before connecting). The file must equal the
   renderer's output, write only its 17-table write set in `public` (never `orgs`), contain no
   DELETE / TRUNCATE / DROP / ALTER / GRANT / bare UPDATE / org write / `seed_default_rbac` / psql
   include / auth or storage write / clock value, use only seed-namespace uuids and the Firefly org id,
   refuse a database without the Firefly org, and carry all four configuration gates.
3. **In-database preflight.** Refuses without a runner-set `seed_target`; refuses a role that RLS
   filters; refuses a database without the Firefly org (*this seed creates no org*); refuses a database
   holding the retired separate staging org; refuses if any seed-namespace id belongs to another org.
4. **The fence.** One `REPEATABLE READ` transaction. A *seed row* is a row of a write-set table with
   `org_id` = Firefly and an id in the seed namespace. Before writing, the fence counts every row that
   is **not** a seed row in every table of `public`, `auth` and `storage` — the tenant's own Firefly
   rows, the Firefly org row, every other org, every global row. After writing it recounts and counts
   the rows this transaction wrote (`age(xmin) <= 0`) among them. Any difference — including one made
   by a trigger — raises, and the whole seed rolls back. A successful run prints
   `fence held — N tables, 0 rows changed outside the seed rows`.
5. **Writes are upserts keyed on the seed's own ids, with fixed values.** No upsert conflicts on a
   natural key the tenant's rows share (department or work-unit key, offering key); the three
   natural-key conflicts all include a seed-id column. Re-applying converges every seeded row back to
   its known state; it never duplicates and never deletes. Rows staff create in Firefly are left alone.

## Verification and repeatability

`verify` is read-only (`BEGIN READ ONLY … ROLLBACK`) and prints one line per check — expected values
are derived from the dataset, never typed — plus a fingerprint of every seeded row's business columns (output shape, illustrative values):

```text
PASS  households            expected 60  actual 60
PASS  stage_lead            expected 14  actual 14
PASS  guardian_email_not_reserved  expected 0  actual 0
PASS  known_first_family    expected Alder Family [Staging seed]/lead/open  actual …
fingerprint 3b1f…
```

Checks whose answer depends on a gate (site, room, catalog and work-unit counts, the known fee and room)
carry an expectation the census evaluates in-database with the seed's own gate expression, e.g. `sites`
expects `3 if seed_campuses, else 0`. Binding checks hold in either shape: every seeded case is at a
Firefly site, its work unit is in Firefly's `lead_management` department, every **open** case has a work
unit (`open_case_without_work_unit` = 0), a child's program category is at that child's site, and every
open case sits in a stage of that department's active Enrollment process.

**Repeatability proof:** `apply` → `verify` → `apply` → `verify`. Every check passes both times and the
two fingerprints are identical. The fingerprint includes the ids families are bound to, so on a
configured tenant it is per-database (stable across re-runs there); on a bare org it is the same
everywhere.

## The in-database proof (throwaway database)

`npm run staging:seed:firefly:prove -- --tenant configured|bare` (`scripts/fireflyStagingSeedProof.ts`,
`lib/staging/fireflyStagingSeed/scratchProof.ts`) drives the real command against a **throwaway** database
and prints one PASS/FAIL line per proof; it exits 1 on any FAIL:

1. **No tenant is created.** If the Firefly org is absent, `apply` must refuse (*creates no org*) and the
   org count must not move.
2. Plants the two **ZZ Alloy QA** orgs and their registry sites by their real ids (`lib/qa/sharedQaRegistry.ts`)
   and the **Firefly org by its real id** — what hosted staging already holds — in the chosen shape:
   - `configured` (hosted staging's shape): the tenant's own two sites with program categories; a
     `lead_management` department whose active `enrollment` process has the hosted tenant's seven stages
     (lead, tour, decision, waitlist, offered, enrolling, enrolled) and seven `lifecycle_wu_<stage>` units;
     a process-less `enrollment` department beside it, as hosted step 1 found; an offering, a charge
     template, household roles, and a family case.
   - `bare` (a fresh local database's shape): the org row only.

   It then hashes every ZZ-owned row, and every row of the **tenant's own** in Firefly (outside the seed
   namespace, plus the org row), across every org-scoped `public` table.
3. `apply` twice — both must be clean (fence held, every check PASS) with one fingerprint.
4. Counts **every** row in the Firefly org before and after (not only seed ids, so a duplicate cannot
   hide) against the dataset for that shape: on `configured`, +0 configuration rows of every kind.
5. Relationship checks, each a count of broken links that must be 0: every seeded case at a Firefly site
   and in Firefly's `lead_management` department, rooms under a seed campus (never a ZZ site),
   guardians/children/cases/contacts/participations all inside one seeded household, no seed row linked
   to the tenant's household, and every seeded household has its case.
6. Drift: hand-edits a seeded household's name; `verify` must fail with a new fingerprint; `apply` must
   restore the known value and the original fingerprint.
7. **Fence sensitivity:** a copy of the committed seed with one write to the Firefly org row spliced in
   before the fence closes must roll back with `FENCE — … public.orgs`, leaving that row unchanged.
8. The tenant's own rows and the ZZ rows must be byte-identical after all of it.

It refuses anything but a loopback database named `firefly_seed_scratch*`, because it writes (the plants
and the drift edit). It is a command, not a vitest live suite: `web/vitest.config.ts` excludes every live
suite unless the governed isolated executor admits it (`tests/harness/liveSuiteAuthority.mjs`).

Make each scratch database **inside the shared `alloy-cert` cluster** (no new containers; never
`supabase start`), cloned from the stack's migrated `postgres` so the fence has real other-org rows to
protect, use one per shape, and drop them afterwards:

```bash
docker exec supabase_db_alloy-cert sh -c \
  'createdb -U supabase_admin firefly_seed_scratch_configured && pg_dump -U supabase_admin postgres | psql -U supabase_admin -q firefly_seed_scratch_configured'
#   expected noise: pg_cron cannot be created outside `postgres` ("schema cron does not exist"), and
#   psql's "backslash commands are restricted" for pg_dump's \restrict lines; neither touches the data.

cd web
FIREFLY_STAGING_SEED_SCRATCH_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54422/firefly_seed_scratch_configured \
  npm run staging:seed:firefly:prove -- --tenant configured

docker exec supabase_db_alloy-cert dropdb -U supabase_admin firefly_seed_scratch_configured
# … and the same with _bare / --tenant bare
```

**Measured 2026-11-25, re-measured after the E3 display marker** with the committed seed (sha256
`0021a4a78db207a81c6a87093b7e62efe5414a18cf4dc63b34ef78d1ad51f9f4`; the pre-marker seed was `8788ee18…`),
each shape on a fresh scratch clone of `alloy-cert` (133 orgs, none of them Firefly): **52/52 proofs
passed in both shapes**, 0 FAIL, scratch databases `firefly_seed_scratch_e3mark_{configured,bare}`
dropped afterwards.

| | `configured` (staging's shape) | `bare` |
|---|---|---|
| refuses without the Firefly org | PASS (exit 1), orgs 133 → 133 | PASS (exit 1), orgs 133 → 133 |
| gates | all `false` | all `true` |
| rows added to Firefly | +60 households, +100 guardians, +75 children, +60 cases, +100 contacts, +75 participations; **+0 configuration** | the same families, plus +1 department, +3 work units, +20 locations, +16 program categories, +8 offerings, +28 variants, +28 rates, +2 charge templates, +6 role types |
| fingerprint (apply ×2, and after drift heal) | one per database — `44135fdac203819c62a812f9d7b8ec2b` on this clone; it varies across clones because the planted tenant's ids are random | `ae08a864d7cff5370c5d0733ce56f302` (pre-marker `6a821fbd…`, the same on three bare clones) |
| fence | held over 355 tables on every apply; the tampered copy rolled back (exit 3) | the same |
| tenant's own Firefly rows | 185 rows byte-identical | 163 rows byte-identical |
| ZZ Alloy QA rows | 329 rows across 272 tables byte-identical | the same |

**Re-measured 2026-11-25 after binding to `lead_management`** (ALY-14 E3; seed sha256
`e08a6e5942976a6c68e7ef765106e2c4e2532361c50615ccb2434bf125235c8d`), fresh `alloy-cert` clones
`firefly_seed_scratch_lm_{configured,bare}`: **52/52 PASS in both shapes**, 0 FAIL. Fingerprints:
`5fd5e44e262edcd18d1d8d203e1ba5bc` (configured, that clone) and `894053617add3d633aa24da78d4696e2` (bare;
it changed because the seeded department's key is part of it). Configured tenant rows 187 byte-identical
(two more planted than before: the process-less `enrollment` department and the seventh queue); ZZ rows
329 across 272 tables byte-identical. With `lifecycle_wu_waitlist` then deactivated on the configured clone,
`apply` refused and rolled back (*no active queue for open seeded stage(s) waitlist*). Both clones dropped.

## Known gaps

- **Run against local throwaway databases only.** Not yet applied to hosted staging (an operator step
  with the staging credential). The `configured` proof models staging from the repository's census
  evidence of the tenant; the real tenant's sites, program-category keys and `lifecycle_wu_<stage>` units
  have not been read for this change. If the tenant lacks one, the seed still writes (and the fence still
  holds) but that family's site, category or work unit is unbound — the binding checks report it.
- **Seeded families sit beside the tenant's own records.** They are marked (tree surnames, `.invalid`
  emails, `555-01XX` phones, `external_source = firefly_staging_seed`, `metadata.seed`, ids in the seed
  namespace) and, since E3, visibly labelled `[Staging seed]` in every household, case and child name
  — not yet seen in the hosted UI, because the seed has not been applied there. Removing them is an explicit, reviewed delete by that
  namespace; the seed itself never deletes.
- **Closed families' stages.** The 9 closed cases use the template stage keys `closed` /
  `closed_withdrawn`, which the tenant's published process (lead → enrolled) does not define. They are
  `status_key = closed`, so no lane shows them; the stage check covers open cases only.
- **Fence cost and reach on hosted staging are unmeasured.** It counts every table in `public`, `auth`
  and `storage` twice; if the staging role cannot read a table there, the seed refuses (fails closed)
  rather than skipping it. A trigger that writes a global or other-org row is a breach by design.
- **Bare-org baseline.** On staging the tenant's control plane (field definitions, layouts, option sets,
  status definitions, its published process) is used as is. On a bare local Firefly org the seed
  authors only campuses, the platform-template process, catalog and roles — not that control plane — so
  a bare local org proves data, not rendered surfaces.
- Not seeded: Catalog items (`commercial_products`), revenue categories / GL accounts, forms and the
  enrollment packet, process instances, open work items, tour bookings (tour dates live on the case
  metadata only), and the four other departments.
