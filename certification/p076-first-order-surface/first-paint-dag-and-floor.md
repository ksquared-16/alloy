# P0-7.6 — the first-paint DAG, reconciled, and the measured floor

Run: erun_bcee4fe9a2bbeeb7 · Lane: lane_73a897409906
Deployed `d2905daf3`. **26 of 26 samples kept, zero drift.** Pinned six-card specimen.

## A1/A2 — every interval named. No generic bucket.

Navigation timing was added to the harness (no deploy needed), so the interval between "server
stopped" and "operator saw a card" is no longer a lump.

| interval | P50 | P95 | share |
|---|---|---|---|
| requestStart (pre-request) | 160 | 240 | 5.5% |
| **TTFB** (requestStart → responseStart) | **34** | 42 | 1.2% |
| **responseStart → responseEnd** | **2,318** | 4,262 | **80%** |
| responseEnd → domInteractive | **8** | 30 | 0.3% |
| domInteractive → FIRST_PAINT (React) | 286 | — | 9.8% |
| **FIRST_PAINT** | **2,906** | 4,655 | |
| **FIRST_ORDER_VISIBLE_COMPLETE** | **2,910** | 4,658 | |

Sum of named terms 2,806 against 2,906 — **96.6% reconciled**, residual 3.4%.

**There is no network term and no framework term.** `encodedBodySize` is **29,270 bytes**; TTFB is
34 ms; the browser reaches `domInteractive` **8 ms** after the last byte. The 2,318 ms
"responseStart → responseEnd" is not transfer — it is the server holding the stream open while it
composes, which `page_total_ms` (2,016) independently confirms.

## The server's own 2,016 ms

| term | P50 |
|---|---|
| `route_identity_ms` | 160 |
| `inner_compose_ms` | **1,506** |
| └ `composition_ready` | 1,500 |
| &nbsp;&nbsp;└ **`document_children_ms`** | **1,296** ← the pole |
| &nbsp;&nbsp;└ `cohort_rows_done_ms` | 682 |
| server RSC render (page_total − the above) | ~350 |
| `admin_client_ms` / `document_actor_ms` | 0 / 0 |

**Everything speculative is already free.** `overlap.tail_ms = 0` (participant 178 + producers 788
fully overlapped) and the Work-View seed's `join_wait_ms = 0` (seed 936 fully overlapped). There is
no scheduling left to recover at this level.

## A3 — document_children after the N+1 repair (n=23)

| phase | P50 |
|---|---|
| `visible_shell_children_ms` | 1,195 |
| ├ `children_overlay_parallel_fetch_ms` | **646** |
| ├ `children_ocm_members_batch_ms` | 143 |
| ├ `children_children_shell_tail_ms` (photos ∥ profile) | 126 |
| ├ `children_child_scoped_contacts_ms` | 117 *(already concurrent with the overlay)* |
| ├ `children_child_persons_ms` | 115 |
| ├ `children_location_labels_ms` | 111 |
| └ `children_process_draft_ms` | 0 |

## A6 — the serial-edge census

Earlier slices already parallelized the three overlay fetches and the scoped-contact link read. The
**one** remaining accidental serial edge is `child_persons` ∥ `location_labels`: the first needs
person ids from L1, the second needs `jrows.location_id` from L1, and neither needs the other.

**Value ≈ 111 ms — one round trip.** It is the only bounded repair left in this owner, and it
cannot change the conclusion below.

## The floor, measured

Non-server terms are fixed at **488 ms** (requestStart 160 + TTFB 34 + to-interactive 8 + React
render 286). So for `FIRST_ORDER_VISIBLE_COMPLETE < 1,000 ms`, **the server must finish in under
512 ms.** It takes 2,016 ms today.

And removing the pole entirely does not get there:

> With `document_children = 0`, `composition_ready` falls to `cohort_rows_done` ≈ **682**, the
> server becomes 160 + 682 + 350 ≈ **1,192**, and FIRST_PAINT ≈ **1,680 ms**.

**Still 680 ms over, with the binding owner completely eliminated.**

Reaching the target requires simultaneously reducing `route_identity` (160), `cohort_rows` (682),
the server RSC render (~350) and the client React render (286) — four owners, none of which is a
query-shape defect. That is an architecture change, not a repair.

## Track B — the WU-07 header

Three things arrive together when the drawer settles, not one:

```
- "Automation Family | Lead        | Work Activity"
+ "Automation Family | New Lead | North Campus | Manage▾ | Work Activity"
```

- **status `Lead` → `New Lead`** — a genuine correction. `resolveOpportunityVmStatusLabel` returns
  `labelFromVmStatus(vm.header.status)` when the drawer VM is present and the **queue preview seed**
  otherwise. The subject's own status is canonical; the seed is a placeholder.
- **location "North Campus"** — an addition.
- **"Manage▾"** — an added action affordance.

So fixing the status alone would **not** take POST_COMPLETE to 0: the header subtree is replaced,
and the two additions change its fingerprint regardless. Closing it needs the canonical status at
commit **and** a decision on whether location and the Manage menu are first-order or Stage-2.

That is why it is returned rather than half-repaired: freezing the seed would trade slow for stale,
and marking the whole header Stage-2 would hide a real correction.
