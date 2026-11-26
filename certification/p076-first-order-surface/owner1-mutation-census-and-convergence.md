# P0-7.6 Owner 1 — the mutation census, the convergence oracle, and a second owner

Run: erun_82492021ea8477a1 · Lane: lane_73a897409906
Deployed `a1ecf609`. Cold real-page samples, pinned six-card specimen (a family with five
children). Samples that drifted to the 4-card household were **discarded loudly**.

## Part 1 — what actually changes when the Drawer VM arrives

Every mutation was bucketed by the drawer VM's own request/response times, on one clock. A
childList replacement arrives as two records in a batch, so records are grouped by
(timestamp, region) and the multiset of added fingerprints compared with the removed.

| phase | authoritative batches | same-value | changed |
|---|---|---|---|
| PRE_REQUEST | 0 | 0 | 0 |
| IN_FLIGHT | 12 | 0 | 12 |
| **AT_RESPONSE** | **12** | 0 | **12** |
| POST_RESPONSE | 0 | 0 | 0 |

Exactly **two authoritative batches per sample** at the drawer response, and they are the same two
every time:

```
- Attendance       "Resolving attendance…"          data-focus-panel-cell-reserved=true
+ Attendance       "Select a child to see their day."
- Health & Safety  "Resolving health & safety…"     reserved
+ Health & Safety  "Select a child to see their health information."
```

`V2.1 − drawer-VM end` = **26–53 ms**. Nothing else in WU-09 changed.

## Part 2 — the convergence oracle

| card | first paint | settled | class |
|---|---|---|---|
| business_process | present | unchanged | **A SAME_VALUE_RECOMMIT** |
| household | present | unchanged | **A** |
| children | present | unchanged | **A** |
| financials | present | unchanged | **A** |
| attendance | **reserved** | KNOWN_EMPTY | **C/E — reserved, not wrong** |
| health_safety | **reserved** | KNOWN_EMPTY | **C/E — reserved, not wrong** |

A reserved cell makes no authoritative claim, so the transition is RESERVED → KNOWN_EMPTY, not
KNOWN → DIFFERENT_KNOWN.

## Part 3 — HARD GATE: LEGITIMATE_AUTHORITATIVE_CORRECTION = 0

For the six configured collapsed cards, **zero** fields require a correction from the Drawer VM.

The card models are identical by construction: commit builds
`buildSelfFetchingCardShell(key, catalogLabel)` = `card({key, title, insight:"", tier:"work",
span:2, density:"compact"})`, and the settled producer builds the same literals. The card renders
`{!memberId ? "Select a child to see their day." : …}` — a pure function of `{model, context}` —
and `participantScope` is null at commit *and* at settled, because the family has five children.
With no member it **issues no request**, so mounting early cannot start a doomed read.

**Gate PASSED. Continue.**

## Part 4 — POST_COMPLETE = 16 is the SAME defect (and reveals a second owner)

All 96 finality-advancing post-complete mutations across 6 samples occur at **one timestamp** —
the drawer-VM response — and split into two owners:

| section | count | what |
|---|---|---|
| **WU-09** Focus Panel Summary Mode | **60 of 96** | the two scoped cards resolving — **repaired here** |
| **WU-07** Focus Panel Shell | **36 of 96** | the record header |

So POST_COMPLETE was never unrelated cleanup: it is the drawer landing after the quiet window
closed.

### The second owner, NOT ungated

WU-07's header change is **not** the same shape as the cards:

```
- "Automation Family | Lead | Work Activity"
+ "Automation Family | New Lead | North Campus | Manage▾ | Work Activity"
```

That is **KNOWN → DIFFERENT_KNOWN** on a status label. `resolveOpportunityVmStatusLabel` prefers
the drawer VM and falls back to `opportunityQueuePreviewSeed.statusLabel`, so first paint shows the
**queue seed's** status until the drawer corrects it.

Per Part 3 this field is NOT ungated, and it is reported instead:

- **field** — the record header's status label (plus location and the Manage menu)
- **first-paint owner** — `drawer.opportunityQueuePreviewSeed.statusLabel` (the queue row seed)
- **Drawer VM owner** — `displayVm`, via `resolveOpportunityVmStatusLabel`
- **why commitCritical lacks it** — it carries `statusKey`/`statusLabel` from the queue preview
  seed, which is a *row projection*, not the subject's settled status; the two genuinely differ
  here ("Lead" vs "New Lead")
- **smallest owner correction** — have the answer carry the subject's own status label rather than
  the queue row's, so first paint states the same value settlement will

**Do not make the stale header final.** Fixing it means correcting its source, not freezing it.

### Why Owner 1 still moves the metric

`perSection` contains only WU-04 and WU-09 — **WU-07 never sets V2.1**. Its header change is a
post-complete mutation, counted in `postCompleteAuthoritative` but not in semantic finality.

Control, measured not assumed: a specimen where these cards are not configured issues **no drawer
VM request at all** and settles at **3,715 ms**, against 7,859–8,490 ms for the six-card samples.

## Parts 5–8 — the contract, and the plants

First paint is authoritative for the collapsed surface; the Drawer VM is Stage-2 enrichment.
Allowed: `DETAIL_ADDED`. Forbidden: `AUTHORITATIVE_COLLAPSED_CORRECTION`, `CARD_REPLACED`,
`KNOWN_TO_DIFFERENT_KNOWN`, `KNOWN_TO_UNKNOWN`, `GEOMETRY_RELOCATED`.

`tests/runtime/collapsedFirstPaintAuthority.test.ts` (16 tests) pins it. **The oracle bites:**
reverting the predicate fails `attendance must mount`. Plants cover a changed fact, card
replacement, geometry relocation, known→unknown, an icon change, a first paint claiming with no
subject, and a frozen UNKNOWN that could never converge.

## Expectation for the deployed measurement

If WU-09 stops changing at drawer arrival, V2.1 should fall to first paint — **~3.3 s**, a saving
of roughly **4.5 s**. `postCompleteAuthoritative` should fall from 16 to about 6: the WU-09 60 go,
the WU-07 36 remain. **This is a prediction to be measured, not a claim.**
