# Alloy API — Data Access, Freshness & Performance Doctrine

**Status:** Doctrine (June 2026). This extends [`api-architecture.md`](api-architecture.md)
with how data should be **retrieved, synchronized, paginated, streamed, cached, and kept
fresh**. Where `api-architecture.md` defines the *contract boundary*, this defines the
*access semantics* behind it.

> **Why this exists.** Alloy must not recreate legacy SIS/CRM behavior: pulling all
> schools/families via serial loops, 15-minute polling windows, stale operational data, or
> multi-hour batch jobs. Alloy's API platform should be reliable, modern, and fast — bulk reads
> without per-location loops, incremental sync instead of full refreshes, and event-driven
> freshness where it matters.

> **Forward-looking note.** Many shapes here (`/api/v1/**`, sync cursors, export jobs) describe
> the **target** public/developer contract per the versioning doctrine
> ([`api-architecture.md`](api-architecture.md) §6). They are the direction new bulk/sync work
> should aim at, not a claim that every endpoint already implements them. The freshness, SLO,
> caching, and anti-pattern rules apply to **current** internal routes today.

---

## 1. Data access principles

1. **APIs are the access layer, not the database.** Consumers bind to documented read
   contracts, never to table shapes or query plans.
2. **No loop-every-location to reconstruct tenant state.** A consumer must be able to read
   org-wide truth (all families, all enrollments) without iterating each location/school.
3. **Bulk reads are first-class.** Org-scoped collection reads with filters are a primary
   capability, not an afterthought assembled client-side.
4. **Incremental reads are first-class.** Sync-capable endpoints expose `updated_since` /
   cursor semantics so routine refresh never means a full pull.
5. **Real-time/event streams complement, not replace, query APIs.** Events say *what changed*;
   query APIs return *current truth*. Neither substitutes for the other.
6. **Every list endpoint has predictable pagination** (§3). No unbounded responses.
7. **Every sync-capable endpoint exposes freshness/cursor semantics** (§5).
8. **Performance expectations are part of the contract.** SLO class (§8) and freshness class
   (§2) are declared per route family, not left implicit.

---

## 2. Freshness model

Every read route family declares a **freshness class**. This is a contract statement about how
current the data is expected to be.

| Class | Meaning | Example |
|-------|---------|---------|
| **Real-time** | Updates available immediately / event-driven | work queues, messages, action results |
| **Near-real-time** | Fresh within seconds | analytics snapshots, operational dashboards |
| **Batch-tolerant** | Fresh within minutes | exports, historical reports |
| **Archived/static** | Rarely changes | configuration catalogs |

**Rule:** operational data (queues, records under active work, messages, action outcomes)
**must not** default to a 15-minute (or any multi-minute) delay. A multi-minute delay is only
acceptable when the route is *explicitly* declared **batch-tolerant** and documented as such.
"Hidden batch delay" on operational reads is an anti-pattern (§10).

---

## 3. Pagination standard

All list endpoints use one envelope-compatible pagination shape (success envelope per
[`api-response-contract.md`](api-response-contract.md)):

```ts
{
  ok: true,
  data: {
    items: T[],
    page_info: {
      next_cursor?: string,   // present iff has_more
      has_more: boolean,
      limit: number
    }
  },
  correlation_id: string
}
```

Rules:

- **Cursor pagination preferred over offset** for large or frequently-mutating datasets
  (offset drifts under concurrent writes; cursors are stable).
- **Stable ordering required** — a deterministic sort key (e.g. `(created_at, id)`) so paging is
  repeatable.
- **Default limit documented** per route family.
- **Max limit documented** and enforced server-side; requests above max are clamped, not errored
  silently.
- **No unbounded list responses.** Absent a limit, the documented default applies.
- **Clients must not infer completeness** from a short page; only `has_more: false` means done.

> Phase 2F reference-data list routes currently return `data.items` without `page_info` because
> they are small, bounded **archived/static** config catalogs. New or large list families adopt
> the full `page_info` shape. When a bounded route grows unbounded, it must adopt pagination.

---

## 4. Bulk access doctrine

Bulk, org-scoped collection reads are first-class. Target public shapes:

```txt
GET /api/v1/families
GET /api/v1/children
GET /api/v1/enrollments
GET /api/v1/locations
```

With **optional** filters:

```txt
?location_id=     # optional scope, NOT a required outer loop
?updated_since=   # incremental sync (§5)
?status=
?limit=
?cursor=
```

Rules:

- A consumer can **pull all families across an org without looping every school.** Org scope is
  the default; location is a filter, not a mandatory iteration axis.
- **Location filters are optional scopes, not required outer loops.**
- Bulk APIs **must support `updated_since` or cursor-based incremental sync** (§5).
- **Large exports use async export jobs (§7), not blocking requests.** A bulk page read is
  bounded and fast (§8); a full-org dump is an export job.
- Bulk reads honor the same org-scoping/deny-by-default rules as every admin route
  ([`api-architecture.md`](api-architecture.md) §5) — bulk never means cross-tenant.

---

## 5. Incremental sync doctrine

Standard sync patterns — timestamp filter:

```txt
GET /api/v1/families?updated_since=2026-06-01T00:00:00Z
```

or cursor-based:

```txt
GET /api/v1/sync/families?cursor=...
```

Sync response extends the pagination shape with a `sync` block:

```ts
{
  items: T[],
  page_info: { next_cursor?: string, has_more: boolean, limit: number },
  sync: {
    cursor: string,          // opaque resume token for the next sync call
    high_watermark: string   // stable timestamp/sequence; resume point for updated_since
  }
}
```

Rules:

- **Support created / updated / deleted semantics.** A sync consumer can converge its mirror
  without a full re-pull.
- **Include tombstones / deletion markers** where deletes must propagate (soft-delete row or an
  explicit `deleted` entry), so consumers can remove records they'll otherwise never see again.
- **Stable high-watermark required** — monotonic and safe to resume from; re-sending the
  boundary record is acceptable (at-least-once), silently dropping it is not.
- **Avoid "full database pull" for routine sync.** Full pulls are a cold-start/repair path, not
  the steady state.

---

## 6. Real-time / event model

Use events (not poll loops) for state that changes under active operation:

- work queue changes
- message received / sent
- action completed
- enrollment status changed
- form submitted
- payment / billing event
- attendance event

**Internal alignment:** the event model must align with Alloy's platform event catalog and
existing workflow/event execution paths — events flow through registered event keys and audited
paths, never ad hoc side channels (see `docs/platform/modules/actions-and-workflows.md`).

**Future public options:**

- **Webhooks** — provider-style outbound delivery to a registered URL (signed, idempotent,
  retried); see the webhook surface class in [`api-architecture.md`](api-architecture.md) §2.
- **Event stream** — a subscribable stream for richer consumers.
- **Polling fallback** — `updated_since` sync (§5) as the always-available baseline when a
  consumer cannot receive events.

**Core rule:** **APIs return current truth; events notify that truth changed.** An event is a
hint to re-read (or carries a payload snapshot), but the query API remains the source of truth.

---

## 7. Export doctrine

For very large data pulls, do **not** force clients into multi-hour loops or blocking requests.
Use async export jobs.

Target future shape:

```txt
POST /api/v1/exports            # create an export job → returns { id, status }
GET  /api/v1/exports/{id}        # poll job status / progress
GET  /api/v1/exports/{id}/download   # fetch the artifact when ready
```

Rules:

- **A job creates a downloadable artifact** (file/object), not a streamed multi-hour response.
- **A status endpoint tracks progress** (queued → running → ready/failed).
- **Exports use the same auth + org-scoping rules** as every other route — an export can never
  widen scope beyond what the caller could read interactively.
- **Exports are auditable** — creation, completion, and download are recorded.
- Export-job creation itself is fast (§8: returns a job id under 1s); the heavy work is async.

---

## 8. Performance SLOs

Initial **internal** targets. These are aspirations to design toward and measure against — not
hard guarantees or contractual SLAs yet.

| API class | Target |
|-----------|--------|
| interactive record read | p95 under 500ms where possible |
| workspace queue read | p95 under 1s |
| action execution preflight | p95 under 500ms |
| simple list read | p95 under 500ms |
| bulk page read | p95 under 2s |
| async export creation | returns job id under 1s |

Each route family should know which row it belongs to. Regressions against these targets are
treated as defects to investigate, consistent with the AdminV2 runtime performance doctrine for
drawer/queue/reveal paths (`docs/system/adminv2-runtime-performance-doctrine.md`).

---

## 9. Caching doctrine

- **Server cache allowed only with clear invalidation.** A cache without a defined invalidation
  trigger is a staleness bug waiting to happen.
- **Stale reads must be explicit.** If a route can serve stale data, its freshness class (§2)
  says so; silent staleness on operational data is forbidden.
- **Action/workflow mutations invalidate affected reads.** A mutation that changes record/queue
  truth must invalidate (or tag-bust) the caches that serve those reads, so the next read is
  current. Coordinated migration applies: the mutation and the read it affects move together.
- **ETag / `updated_at` / cache headers** should be considered for public APIs to enable
  conditional requests (`If-None-Match` / `If-Modified-Since`) and cheap revalidation.
- **Client caches must respect correlation/debug metadata.** Correlation id and any debug
  markers are not cache keys and must not be collapsed across distinct requests; honor freshness
  signals rather than serving an arbitrarily old body.

---

## 10. Anti-patterns (explicitly rejected)

- **One API call per school/location** to reconstruct org data — bulk org reads exist (§4).
- **Full-table pulls as routine sync** — use incremental sync (§5).
- **15-minute (or any multi-minute) forced polling for operational data** — use events (§6) or
  fast `updated_since` sync; operational data is real-time/near-real-time (§2).
- **Undocumented rate limits** — limits must be discoverable and documented.
- **Unbounded list responses** — every list paginates (§3).
- **Mixed freshness semantics** within one route family — declare one class (§2).
- **Hidden batch delays** on data that callers reasonably expect to be current.
- **APIs that require UI scraping patterns** to obtain data available no other way.
- **APIs whose response shape differs from internal truth** — the contract is the same truth the
  platform runs on, not a divergent projection.

---

## 11. OpenAPI implications

When the OpenAPI `v0` spec is authored (gated per [`openapi-readiness.md`](openapi-readiness.md)),
it must include, as shared reusable components:

- **Pagination schema** — `page_info` (`next_cursor?`, `has_more`, `limit`).
- **Error schema** — the `ApiFailure` envelope (`error.code` enum + `message` + `details?`).
- **Correlation id schema** — `correlation_id` (body) + `x-correlation-id` (header).
- **Sync/cursor schema** — the `sync` block (`cursor`, `high_watermark`) where the family is
  sync-capable.
- **Explicit freshness notes per route family** — each documented operation states its freshness
  class (§2) and SLO class (§8).

**Do not start broad public OpenAPI until these data-access semantics are defined** for the
families being specified. A spec that omits pagination/sync/freshness would misrepresent how the
data actually behaves.

---

## Related

- [`api-architecture.md`](api-architecture.md) — governing API platform doctrine
- [`api-response-contract.md`](api-response-contract.md) — envelope + helper spec
- [`openapi-readiness.md`](openapi-readiness.md) — OpenAPI eligibility gate
- [`api-contract-migration-status.md`](api-contract-migration-status.md) — progress tracker
- `docs/system/adminv2-runtime-performance-doctrine.md` — runtime reveal/perf baseline
- `docs/platform/modules/actions-and-workflows.md` — platform event catalog + execution paths
