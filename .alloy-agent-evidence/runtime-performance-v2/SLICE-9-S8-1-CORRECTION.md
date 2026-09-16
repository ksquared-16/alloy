---
owner: runtime
status: active
last_reviewed: 2026-09-15
supersedes: []
---

# Slice 9 — S8-1 does not exist: attribution correction

**Lane** `lane_73a897409906` · **Run** `erun_43a521d7f0d5ee69` · base `305357896`.

**Conditions.** `ALLOY_DEV_STRICT_MODE=0`; timing BLOCKED, no latency claim. **No product code
changed.** Browser-side `fetch` interception only (no source modification), removed with the page.

---

## THE CORRECTION

**Slice 9 was commissioned to fix a defect that is not there, and the error was mine.**

Slice 8 reported `provisioning-answer ×3` for one mutation and classified it "REQUIRED BUT
DUPLICATED, ~198 KB redundant". That classification came from grouping the fan-out by endpoint
**path**, which collapsed the `subject_id` query parameter. Re-reading the same raw capture:

| t | subject | KB | what it actually is |
|---|---|---:|---|
| 3898ms | **`468a5a95`** | 96 | **the mutated subject** — required |
| 4972ms | `1a132b7f` | 99 | a *different* subject — sibling prewarm |
| 4973ms | `eb5394c7` | 22 | a *different* subject — sibling prewarm |

Three different answers for three different subjects. **Not one answer fetched three times.**

The approved Slice 9 instruction inherited that premise ("three equivalent/full refreshes"), and its
own Phase B is precisely the check that catches it — *"they must NOT simply be collapsed because the
URL matches"*. Applied honestly, it dissolves the finding.

## 1–3. Trigger provenance (Phases A–C)

Re-run on a freshly ensured fixture (`opportunity_backed` = `07f63d86`), with a browser-side `fetch`
interceptor capturing a stack trace and the parsed response per request.

**After the mutation confirm there was exactly ONE provisioning request:**

```
2638ms  subject=07f63d86  96kb  terminal=operational
        window.fetch
        fetchProvisioningEntryDeduped   (lib_runtime…js)
        Object.entryResource            (lib_runtime…js)
```

**Provisioning total 1 · for the mutated subject 1 · for other subjects 0.**

It arrives through `fetchProvisioningEntryDeduped` → `entryResource` — i.e. through the **coalescer
Slice 2 built**, which is already doing its job. There is no second or third trigger to attribute,
no duplicate listener, no refresh recursion, no key mismatch.

**Structural shape: none of A–F.** The premise was a measurement artefact.

## 4–6. Equivalence, generation, root cause

No two provisioning responses to compare — there is one. The two extra requests in Slice 8 were
**different subjects**, so hashing them against each other was never the right question.

**Root cause of the reported defect: analyst error in Slice 8's classifier**, not runtime behaviour.
The fan-out grouping key was `url.split("?")[0]`.

**One genuine observation worth carrying** (not a defect claim): the single post-mutation provisioning
answer carried `rowStage = "lead"` at 2.6s — pre-mutation membership — while the queue row visibly
converged to Waitlist at ~5s in Slice 8. So the provisioning answer is **not** what converges the
row; the stage VM / `queue-view-totals` / `stage-membership-ack` path does. Whether a post-mutation
answer *should* be able to carry pre-mutation row truth is a generation question, and it is recorded
as **S9-1** rather than asserted as a bug.

## 7–12. Repair, tests, before/after

**No repair. No commit of product code. No tests added.**

Before/after fan-out is **unchanged and not claimed**: nothing was altered, so Slice 8's 12 requests /
464 KB stands as the current behaviour. Of that, ~121 KB belongs to **S8-2** (two sibling prewarms of
unrelated subjects), not to a duplicate-refresh defect.

**S8-1 is CLOSED as "does not exist — misattributed".** Its bytes move to S8-2, which was already
correctly identified in Slice 8 and is already frozen behind the R-018 quiet-host A/B.

## 13–16. Race, convergence, Current Work, continuity

Not re-measured, because nothing changed and re-running them would assert freshness they do not have.
**Slice 8's certified results stand**: New 3→2, Waitlist 16→17, All unchanged, row Lead→Waitlist,
counts and rows never disagreeing, cards 6→6, rows 7→7, no remount, no blank, no false empty.

The stale-response race the instruction asked about **was not made harder to observe**, because no
deduping was added.

## 17. Fixture reset / verify

```
ensure → ok          verify → ok, findings: []        (clean start, unlike Slice 8)
… mutation executed through the real 3-step command …
reset  → ok, removed: households 2, children 2, opportunities 2, journeys 2, participations 2
ensure → ok          verify → ok, findings: []
```

No residue. The fixture opened *and* closed canonical this time.

## 18. S8-3 — attributed, NOT repaired

**Reproduced: `eligible-enrollment-children` ×2 on command-panel open.**

**Attribution — two independent callers for one answer:**
- `eligibleEnrollmentChildrenWarmCache.ts` — TTL + in-flight dedup, warmed on operator intent;
- `CurrentWorkSubjectSelectorPanel.tsx:278` — peeks the warm cache, and on a miss issues its **own raw
  `fetch`** that does not participate in the cache's in-flight dedup.

So a panel opened while the prewarm is still in flight produces two network operations. This is
shape **D/E** from the instruction's taxonomy — equivalent callers bypassing existing inflight reuse.

**Not repaired, deliberately.** The instruction authorises repair only if "isolated and **obviously
equivalent**". It is isolated but **not** equivalent: the panel's own path surfaces
`json.error.message` and an error phase ("Could not load children for this family"), which the warm
loader discards by returning `null`. Converging them naively would change failure behaviour on a
command panel. The repair is small and specified — route the fallback through
`prefetchEligibleEnrollmentChildren` while preserving the error branch — and belongs in a slice that
can test the failure path, not as an end-of-audit edit.

## 19. S8-2 — carried, and now better evidenced

Two unrelated-subject provisioning answers (~121 KB) plus an unrelated drawer VM were fetched during
mutation convergence. Carried unchanged for the R-018/D-3 quiet-host A/B. **This slice strengthens
the evidence rather than spending it:** the prefetch does not merely warm neighbours, it does so
while the operator waits for a mutation to settle.

## 20. Ranked map

| Rank | ID | Item | State |
|---|---|---|---|
| ~~P1~~ | S8-1 | "triple provisioning refresh" | **CLOSED — misattributed; does not exist** |
| P1 | S7-1 | configuration invalidation: no cross-session, no TTL | open; blocks S6-1 / S5-3 |
| P2 | **S9-1** | post-mutation provisioning answer can carry pre-mutation `rowStage` | **new, observation only** |
| P2 | S8-2 | speculative sibling prefetch competes during mutation convergence | carried → R-018 A/B |
| P3 | S8-3 | `eligible-enrollment-children` ×2 | attributed, repair specified |
| P2 | S6-1 / S5-3 | payload convergences | blocked by S7-1 |
| P2/P3 | S5-4 · S4-1 · F-2 · S3-4 · D-2/R-005 | carried | unchanged |

## 21. Recommended Slice 10

**Not another mutation-coalescing slice** — there is nothing to coalesce.

1. **S7-1 (P1)** — the configuration-lifetime decision. It is the only open P1 and it has blocked two
   payload convergences for three slices. It needs a product decision, not more measurement.
2. **S4-1** — five cards, the reserved-geometry contract already exported. Genuinely contained, and
   the cheapest remaining real improvement.
3. **S8-3** — with the error path covered by a test.

**A process note worth keeping.** Slice 8's classifier collapsed a query parameter and produced a
confident, quantified finding that survived into an approved instruction. What caught it was reading
the raw capture again before acting on it. Byte totals grouped by endpoint path are not evidence of
duplication; **request identity includes the parameters that change the answer** — the same rule
Slice 2 established for coalescing keys, applied to measurement rather than to the runtime.
