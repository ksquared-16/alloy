---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering
last_reviewed: 2026-09-22
supersedes: []
---

# Thread 7 — Rate class separation: acceptance delta

The decision was already made: **authenticated reads and writes must have
independent counters.** This is the evidence that they now do. Nothing else in
Thread 7 changed.

---

## 1. Final rate table

| Class | Limit | Window | Keyed on |
| --- | --- | --- | --- |
| Token exchange | 30 | 60 s | presented `client_id` + hashed caller address |
| Authenticated reads | 600 | 60 s | Installation |
| Authenticated governed writes | 120 | 60 s | Installation |

Three counters, one per class. The limits are unchanged — they were never the
defect.

## 2. Read does not consume write

**Before the repair**, measured over HTTP against a fresh installation:

```
WRITE #1 (no reads yet)            limit=120  remaining=119
…130 reads, zero writes…
WRITE #2                    429    limit=120  remaining=0
READ  (same moment)         200    limit=600  remaining=467
```

**After the repair**, same shape:

```
WRITE #1                           limit=120  remaining=119
…130 reads, zero writes…
WRITE #2                    ≠429   limit=120  remaining=118
```

The write counter moved only for the two writes. Certified in
`rateLimitClasses.live.test.ts` case A.

## 3. Write does not consume read

Twenty writes, then a read: the read counter moved by exactly the one read. Case
B.

And at the extremes, both directions: exhausting the write budget leaves reads
answering `200` with a full `600` limit; exhausting the read budget leaves the
write budget whole at `remaining=119`. Cases C and D.

## 4. Final partner-facing wording

> Token exchange, authenticated reads and authenticated writes have
> **independent rate budgets**. Reads and writes are counted separately, so
> paging a large collection never eats into your ability to submit, and a
> backlog of submissions never stops you reading.

Every response reports the budget that governed *that* request — `600` on a
read, `120` on a write — with `Retry-After` on a `429`.

---

## Two things stated rather than smoothed over

**A missing-scope `403` carries no rate headers.** It is refused before the
budget is consulted, deliberately: an unauthorized caller should not be able to
drain a budget it was never entitled to spend. A refusal *after* admission — a
`400`, a boundary `403`, a `429` — does carry them.

**The window is a fixed 60-second interval aligned to the clock**, not a sliding
window from your first request. This is documented because it is observable:
`RateLimit-Reset` counts down to a shared boundary. It also caught the first
version of the certification, which burned across a boundary and concluded the
read limit was unenforced.

## What keeps this fixed

The counter and the policy are now chosen together, and the class comes from the
operation catalog rather than the HTTP verb. A caller cannot pair the write
policy with the read counter because it does not pick them separately, and a
future write operation inherits the write budget without anyone remembering to
wire it.

## Evidence

502 tests green across 30 files, including 11 live specs that measure the three
classes over HTTP — isolation in both directions, both limits enforced,
installation isolation, token exchange unregressed, headers on success, `400`,
both kinds of `403`, and `429`, and proof that a rate-limited request performed
no work. Seven prebuild guards green. Canonical `tsconfig.build.json` typecheck
and production build both passed through the broker; the build's first attempt
was refused for host capacity while another lane held 6/9 and ~11 GB, and passed
on retry.

Nothing pushed, promoted or deployed.

**Classification: `THREAD7_HUMAN_ACCEPTANCE_READY`.**
