# Work Items — hosted convergence certification evidence

Certification evidence for the Work Items sprint. Both censuses were executed by the Director on the
trusted host; this lane never held hosted credentials.

## Environment

| | |
|---|---|
| Certification org | Firefly Early Learning — `93667019-bd28-49b5-a688-acc9bb1e0a19` |
| Hosted database | `ikaxilmwmrmbagoidedu` (the database the application itself runs against) |
| Certification opportunity | `468a5a95-dcfa-45ab-9829-34709dd9a154` (fixture family `opportunity_backed`) |
| Process instance | `c8421218-a1c6-4ea0-bae2-1e44eb9a6ccd` |
| Fixture | `enrollment_certification` (`ensure` and `verify` both ok, no findings) |

The org was not chosen heuristically. A prior governed census (`tha_02abf84c88298f`,
`../enrollment-participation-anchor/org-topology-census.sql.results.json`) shows the tenant holds two
orgs, and the other — Alloy Bend `7803388d-cdee-4afb-89cf-23a137f39423` — has **zero departments and
zero enrollment journeys**, so the fixture's Create Lead entry department cannot resolve there.

## B — Business Process convergence, data layer

`bp-convergence-census-r2.sql` → `tha_1ecaa8db69a076`, run 2026-09-10T21:58:05Z.

Known BP stage work on the certification opportunity:

| field | value |
|---|---|
| `task_id` | `a3cfcbee-14a5-4761-9181-d8c8cfca2dca` |
| `work_intent_key` | `contact_family` |
| `operating_plan_template_key` | `contact_family` |
| `lifecycle_stage_key` | `lead` |
| `is_bp_stage_work` | `true` |
| `has_assignee` / `has_due` | `true` / `true` |
| `status` | `open` |
| `source` | `manual` |

**The `source = manual` / `is_bp_stage_work = true` pairing is correct and must not be "fixed".** The
runtime identifies Business Process stage work from its METADATA — `isBusinessProcessStageWorkTaskRow`
reads `lifecycle_provenance`, `operating_plan_template` and the template/stage key pair — not from the
`source` column. `source` records how the row was written, not what the work is.

### Duplication proof

- Exactly **one** BP stage-work task exists for the certification opportunity.
- `duplicate_open_bp_work` (same entity + work intent + stage, more than one OPEN row) returned
  **zero rows org-wide** — its absence from `question_ids` is that zero.
- Four BP stage-work rows existed org-wide at census time.

This establishes **B = DATA_CERTIFIED**. It does **not** establish the UI round-trip, which requires
authenticated browser access.

## H — virtual sources persist nothing

`h-virtual-source-census.sql` → `tha_8f0a6849e03acd`, run 2026-09-10T22:01:12Z.

The tenant holds real actionable source data — 4 `communication_threads` at `needs_response`, and 6
`processing_cases` at `needs_resolution` (plus 137 `received`) — so H is not blocked by absent data.

The leak check `virtual_source_durable_rows` returned **zero rows**: no `operational_tasks` row
anywhere in the org carries `communication_thread_id` or `processing_case_id`. Corroborated by
`tasks_total_by_source` — only 4 durable rows org-wide (3 open manual, 1 canceled), all BP stage work.

Communications and Processing projections therefore persist **nothing**, which is the
zero-duplicate-persistence guarantee the convergence doctrine requires.

## Content policy

These artifacts carry counts, states, keys and infrastructure identifiers only. No person, child,
family or message content, no free text, and no credentials, tokens or connection strings.
