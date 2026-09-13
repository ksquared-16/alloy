# Processing → Work Items convergence — evidence

Lane `lane_cb3973afe2c7` · run `erun_362fcc8698efa0c3` · slot 12 · `http://127.0.0.1:3022`
Tenant: Firefly Early Learning (shared `alloy-cert` stack). Date: 2026-09-11.

Both reported blockers had ONE cause. `warmProcessingQueueCache` fetched
`/api/admin/processing/queue` with no parameters, so `buildProcessingQueueRequest` produced
`statuses: undefined`, `limit: DEFAULT_QUEUE_LIMIT` (25), `created_at desc`. That recency page was
then used as two things it is not: the universe of selectable cases, and the actionable-work cohort.

## Measured, through the running app

Tenant counts: `received 139 · needs_resolution 6 · archived 2` (everything else 0).

| read | rows | status mix |
|---|---|---|
| `GET /queue` — the old projection input | 25 | **all `received`** |
| `GET /queue?status=<4 actionable>&limit=100` — a status filter alone | 100 | **still all `received`** |
| `GET /queue?status=needs_review,needs_resolution&limit=100` | 6 | the six `needs_resolution` |

The middle row is the important one. **A status filter was necessary and not sufficient**: a
filtered page is still a recency page, and 139 `received` cases crowd out all six long before the
limit is reached. That first repair passed every unit test and would have shipped still broken. The
cohort is therefore read in BANDS, each on its own budget.

This also answers the canonical question. The cohort was never a product decision about
actionability — it was a page boundary. The adapter's `deriveProcessingLane` has always routed
`needs_resolution` into the `needs_review` lane and always intended to project it; it never saw one.
No projection semantics were changed. `received` stays in the cohort because
`openProcessingCaseFromSource` opens cases there and nothing advances them automatically.

## Browser proof — exact case deep selection

Target `dae51d51-b492-45c8-a650-5477ad9cd848`, status `needs_resolution`, **not on the old default
page**.

1. Work Items → Queue → Unassigned: 101 rows, 99 of them Processing projections, **including the
   target**. Under the old read this case could not appear at all.
2. Selected it → `Open processing case`.
3. Processing rail: **26 rows** — the 25-row page plus the requested case resolved by id and merged
   in — with `aria-current="true"` on exactly one row, the requested one. **PASS.**

## Browser proof — archive convergence

Target `d7fcb4e1-0c4d-4e32-ae21-65b9b3e83a48`, status `received`, also off the default page. A
`received` case was used deliberately so the six `needs_resolution` cases stay intact as the evidence
sample for the investigation.

| step | result |
|---|---|
| projected into Work Items | yes (101 rows) |
| `Open processing case` → exact selection | **PASS**, one occurrence |
| Archive through the authoritative Processing UI (row actions → Archive import → confirm) | status `received` → **`archived`** |
| Work Items projection after archive | row **gone** — convergence **PASS** |
| durable `operational_tasks` duplicates | **PASS** — see below |

Archive remains what the safety inspection described: one `processing_cases` status write,
idempotent, no communications, no provider calls, no customer-record mutations, no financial
effects (`archiveProcessingCaseForAdmin`). **Approve was not used.** Processing status was never
written directly — the change went through the product's own UI.

### Zero durable duplicate

`GET /api/admin/operational-tasks?scope=workspace&filter=all` → 6 durable rows.

- rows carrying the archived case id: **0**
- rows with a `processing:` id shape: **0**
- rows carrying `processing_case_id`: **0**
- the six `needs_resolution` case ids found in durable rows: **0 of 6**

The projection stays virtual. Widening the cohort is precisely the change that would have exposed a
leak, and none exists.

## A regression the browser caught that the tests did not

Auto-opening the folder holding the requested case initially opened EVERY folder containing it.
Folders are overlapping filter layers, so an Incoming case that also matches a category rendered
**twice**, both copies marked `aria-current`. Fixed to open exactly one (most specific wins), and
pinned by `renders the requested case EXACTLY ONCE, in one folder`.

## What is NOT proven here

**Hosted evidence was not re-read.** Governed census `gar_0b07a15f0496d9` against
`alloy_deployed_primary` failed with `execution_failed` — operator-approved at 20:15:26Z, then
failed in the same millisecond with `trusted_host_action_id: null` and `execution_ended_at: null`.
The request itself was well formed: `validateInputs` returned `{ ok: true }` locally, the query rode
in `artifact_refs`, and the target was `alloy_deployed_primary`. This is a host-side execution gap,
not a caller error, so it was not refiled. The query is kept at
`processing-projection-window-census.sql` and can be run unchanged when the capability is available.

Everything above was measured against the local certification tenant instead, which reproduces the
reported hosted shape exactly — six `needs_resolution` cases, none of them reachable through the
default page.

## State left behind

Case `d7fcb4e1-0c4d-4e32-ae21-65b9b3e83a48` is now `archived` on the shared cert tenant. That was
the sanctioned certification action; it is a soft archive and its source records are preserved.
