---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering
last_reviewed: 2026-09-22
supersedes: []
---

# Thread 7 — Consistency repair: Human Review delta

**You do not need to reread the package.** The resource model, lifecycle model
and scope architecture already passed review and are unchanged. Six things to
confirm, each a consistency repair.

Mounted at **Organization → Integrations → Developer documentation**.

---

## 1. Final scope table — 13 grantable

**Where:** Full specification → §5.

Thirteen, up from the eleven the document claimed: `enrollment.write` and
`schedule.write` were shipped but never listed. `context.read` remains retired
from the grant model and is not offered to operators; it is still *recognised*,
so an installation already holding it does not degrade.

**Confirm:** the two new rows read as governed capability —
*"Start and end enrollment, and assign or move placement, for authorized
children"* — rather than as generic edit access.

## 2. `.read` / `.write` explanation

**Where:** Integrating with Alloy → §9a; specification → §11a.

Unchanged from the accepted batch. Present here only because the scope table
above now has two write entries to point at.

## 3. Operation count and lifecycle summary

**Where:** specification → §2 and §14; package `README.md` item 8.

Measured from the contract: **19 operations = 1 token exchange + 11 reads +
7 governed writes.**

Removed: *"there is exactly one write"* and *"the one write is governed fact
submission"*, which were true before the lifecycle operations shipped and became
globally false afterwards.

**Kept deliberately**, because they remain true of Attendance specifically:
Attendance is append-only, `POST /api/v1/attendance-events` is Attendance's only
write, corrections and reversals are new facts, and there is no `PUT`, `PATCH` or
`DELETE` anywhere.

## 4. Rate-limit table — and one correction worth your attention

**Where:** specification → §13; Integrating → §10.

The specification documented token exchange and reads but omitted the write
class. It now carries all three: **30/60s token exchange, 600/60s reads,
120/60s writes**, keyed on the Installation.

**The correction:** the guide promised reads and writes have *separate budgets*.
They do not. Both classes consume the **same per-installation counter** and
compare it against different limits — so a partner that spends a window paging
collections finds its next write refused at 120 without having written anything.

This was measured over HTTP, not inferred: the gap between the two remaining
counts tracks the gap between the two limits, which separate counters could not
produce. The documentation now says what the runtime does.

**Your call, not mine:** the runtime behaviour is coherent (one budget, a
stricter threshold for the more expensive class) and I documented it rather than
changing it, because changing a limiter is not a documentation repair. If you
would rather reads and writes had genuinely independent counters, that is a
small, separate change with its own certification.

## 5. Synchronization Quickstart

**Where:** specification → §15 Quickstart; Locations guide; the Locations
operation in the API Reference.

All three taught the old advice — *remember the highest `updated_at`, then rewind
your checkpoint slightly*. That was correct before sync tokens existed and is now
strictly worse than the certified law.

Every partner document now teaches: `next_cursor` within a pass, `sync_token` /
`since_token` between passes, and `updated_since` only for deliberate time-based
reconciliation. `updated_since` remains in the contract; it is simply no longer
the default advice, and there is nothing to rewind when a token identifies an
exact row.

## 6. Package README summary

**Where:** package `README.md`, "ten things worth knowing", item 8.

Now describes seven governed writes rather than one, and keeps the CRUD
prohibition. Classification remains **PARTNER_READY**. The mapping worksheet is
untouched: every provider column still reads *"Provider confirmation required"*.

---

## What holds this together going forward

The counts in the specification are no longer written down by hand — a test
derives them from the contract and the runtime scope catalog and fails if the
prose disagrees. That is the actual fix: the five stale statements existed
because four documents were individually correct and the surface moved
underneath them, and nothing noticed.

## Evidence

495 tests green across 30 files, including four new live specs that measure the
rate-limit classes over HTTP and thirteen that hold the package's counts against
runtime. Seven prebuild guards green. Canonical `tsconfig.build.json` typecheck
and production build both passed through the broker. Mounted documentation
re-rendered and scanned clean of stale copy, literal Markdown and frontmatter.

One incidental repair: rate-limit headers were attached on success and on `429`
but dropped on `400` and `403` — the responses a client deciding whether to back
off most needs them on. They now travel on every response once the budget has
been consulted.

Nothing pushed, promoted or deployed.
