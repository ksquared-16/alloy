# P0-7.6 Repair A — the children N+1 removed, and a correction about the activity count

Run: erun_59852e9436f6f491 · Lane: lane_73a897409906
Deployed `03f93ec6f` (containment proven over `856c4eeaf`). 26 of 26 samples kept, zero drift.

## Part 1 — the decomposition that found it

Using the drawer's own phase marks over the **same** shell (n=12 before, n=23 after):

| phase | before | after | saving |
|---|---|---|---|
| **`children_overlay_parallel_fetch_ms`** | **2,296** | **754** | **−1,542** |
| `visible_shell_children_ms` | 2,798 | 1,279 | −1,519 |
| `children_ocm_members_batch_ms` | 130 | | |
| `children_children_shell_tail_ms` (photos) | **124** | | |
| `children_child_scoped_contacts_ms` | 115 | | |
| `children_child_persons_ms` | 109 | | |
| `children_location_labels_ms` | 108 | | |
| `children_process_draft_ms` | 0 | | |

Reconciles to ~103% of the shell wall. **Photos are 124 ms** — the measurement overruled the
photo-split hypothesis, and no photo split was made.

## Repair A — the N+1

The three legs of that `Promise.all` were already concurrent with each other. The serial cost was
**inside** one: `resolveDurableFactsForChildren` awaited a full enrollment read model **per child,
inside a `for` loop**. Each iteration reads only its own `agr.id` and writes one key.

Ordering preserved deliberately (duplicate members keep last-write-wins in iteration order), so the
map is byte-identical. Same reads, different schedule.

**The oracle bites cleanly**: on the serial version the 8 exact-parity tests still pass while both
concurrency tests fail (307 ms vs ~60 ms; overlap −62 ms).

## Server result

| span | before | after |
|---|---|---|
| `document_children_ms` | 2,584 | **1,360** |
| `document_children_tail_ms` | 2,068 | **654** |
| `composition_ready` | 2,744 | **1,526** |
| FIRST_PAINT | 3,555 | **2,469** |

## Product result — stated with its confound

| population | before | after |
|---|---|---|
| drawer requested | n=8, **8,340** | n=20, **5,611** |
| no drawer | n=18, **3,652** | n=6, **2,602** |
| **aggregate P50** | **4,762** | **5,347** |

**Within each population the repair is a large win** (−2,729 ms and −1,050 ms). The aggregate rose
only because the population **mix** shifted: 18 of 26 had no drawer before, only 6 of 26 after.
Reporting the aggregate alone would misstate this in either direction, so both are given.

## CORRECTION — the activity count is not what I repaired

The previous run resolved the **tour signal** at commit, believing it drove the collapsed activity
count. It does not, for this specimen. The projection is:

```
canonical = resolveCanonicalCurrentWorkActivityEntries(context.truth)   // the activity TIMELINE
if (items.length > 0) return items
if (tour.scheduled && tour.startAt) return [ "Tour scheduled" ]          // fallback only
```

`resolveCanonicalCurrentWorkActivityEntries` reads the record's **activity timeline**
(`resolveLayoutRuntimeActivityTimeline`, surface `opportunity_drawer`). At settlement that timeline
is **not** empty, so the tour fallback never fires and the count comes from drawer-owned truth.

**Measured, both lineages: the activity-count span mutates only AFTER the drawer — 8 of 8 before
the tour repair, 20 of 20 after it.** The tour repair is correct in itself and the signal is now
resolved at commit, but it did not close this correction.

### And my oracle was blind to it

The batch classifier compares `addedFp`/`removedFp`. A `characterData` mutation carries **neither**,
so it is scored "same-value" by default. **The previous run's "0 CHANGED / Gate A PASS" was
therefore not evidence about this field.** That limitation is the oracle's, not the data's, and it
is recorded here rather than left implicit.

## The remaining owner

**The drawer VM, via the collapsed activity count.** V2.1 = drawer-end + 39 ms in 20 of 26 samples.

Closing it means the answer carrying the **activity timeline** at commit — not one signal, but a
timeline projection that is currently drawer-owned. That is a materially larger acquisition than
anything in this sprint and needs a Director decision, because it moves a genuinely
settlement-owned surface into first order.
