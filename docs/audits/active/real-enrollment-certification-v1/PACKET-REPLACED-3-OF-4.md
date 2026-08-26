# Packet replaced. Uploads 0 → 3, not 4 — and the fourth has a cause you should decide.

Two defects fixed, the invalid packet cleanly replaced, and one honest shortfall reported rather
than rounded up. Nothing bound to Business Process, no Enrollment, no Participant Runtime.

---

## What was actually wrong — two layers

**1. The realization never applied the approved decisions.** A clause upload becomes a `file_ref`
only because `applyDiscovery` attaches it to its section, and the service built each Form straight
from the projected structure. The Forms looked complete and asked for no documents at all.

**2. Fixing that exposed the deeper one.** All four uploads were **neither bulk-safe** (confidence
`review`) **nor claimed by the review queue** — invisible to both predicates. Nobody could have
approved them. Four document requirements the review reported finding, that no operator could act on
and no packet would ever ask for.

So `needsOperatorReview` now claims any **executable obligation** that is not bulk-safe — and
deliberately not the held, derived, financial and reuse rows, which are conclusions the operator
inspects rather than decisions they make. The regression control fails on the old implementation and
passes on the new; a companion control asserts no obligation is invisible to both predicates.

The four uploads were then approved through the same `discovery-decisions` command as everything
else: **54 persisted, 4 of them uploads.** No helper, no synthesis.

## Replacement evidence

Before deleting, proved: **6/6 Forms and 1/1 packet created solely by this handoff**; **0** packet
sessions; **0** session items; **0** form submissions; **0** Business Process references; **0**
external form references. Removed packet `39dbb42b…`, its 6 items, 6 versions, 6 Forms, and the
realization link. **Source documents, the Processing case, the packet analysis and your persisted
review decisions were not touched** — 3 sources still attached.

## The replacement packet

**`320b8c0b-c661-4242-9f44-f37390f3ff42`** — *School of Enrichment — Enrollment Packet*

| # | Item | Form definition | Pinned version | Label | Uploads | Sigs |
|---|---|---|---|---|---|---|
| 0 | `bb4b7c05…` | `2ee88ba9…` | pinned | Oregon Certificate of Immunization Status | **1** | **2** |
| 1 | `4e4bcd0e…` | `31b2e2fd…` | pinned | Oregon Nonmedical Exemption | **2** | 1 |
| 2 | `39b8a4a3…` | `08e0f9c7…` | pinned | School of Enrichment Admissions Packet | 0 | 0 |
| 3 | `9bbf3a12…` | `9d19b1cb…` | pinned | Tuition & Enrollment Agreement | 0 | 1 |
| 4 | `4b32e5b1…` | `19c1b7bb…` | pinned | Parent Handbook Acknowledgement | 0 | 1 |
| 5 | `8c9ef0d0…` | `f1b0c46a…` | pinned | Direct Payment Authorization | 0 | 1 |

Exact ids in `/tmp/items.txt` and in the realization stored on the case. **6 Forms, 6 published
versions, 1 packet, 6 items, 0 unpinned.**

## Before → after

| | Before | After | |
|---|---|---|---|
| `file_ref` controls | 0 | **3** | 🛑 expected 4 |
| Signatures | 6 | **6** | ✅ 2/1/0/1/1/1 |
| Destinations | 180 | **180** | ✅ |
| Canonical fields created | 0 | **0** | ✅ (12 pre-existing seeds unchanged) |
| Safeguarding rows | 0 | **0** | ✅ |
| Payment methods | 0 | **0** | ✅ |
| Packet items unpinned | 0 | **0** | ✅ |

**Idempotency:** a second invocation returned the same packet id, and no seventh item, duplicate
Form, version or control was created.

## 🛑 The fourth upload — cause, and the decision it needs

| Source | Artifacts | Uploads | Fill intent |
|---|---|---|---|
| Family handbook | **0** | **1** | `reference` |
| Oregon CIS | 2 | 3 | fillable |
| Admissions capture | 4 | 0 | fillable |

The fourth upload is the handbook's ACH-update clause, in its *Tuition Agreement* section. **The
handbook is a reference document**: it contributes 0 destinations and produces **0 artifacts**, so
there is no Form for its obligation to live on. Three uploads land correctly on the two CIS
artifacts (1 + 2); the handbook's has nowhere to go.

This is not a bug in the fix — it is a modelling question the corpus just asked:

> **Where does an obligation belong when the document that states it is not itself executable?**

Two honest options, and I did not pick one:

1. **Attach reference-source obligations to a designated artifact** in the packet — probably the
   unsigned collection artifact, which is where "things this packet needs from you" naturally sits.
2. **Treat a reference document's obligations as operator-facing only** — the handbook tells the
   school what to require; the requirement is authored deliberately rather than derived.

Option 1 makes the packet ask for it; option 2 says a handbook sentence should not silently become a
parent's obligation. That is your call, not mine.

## Studio

`http://127.0.0.1:3014/login` → **Processing** → **Studio** → **Packets** →
*School of Enrichment — Enrollment Packet* (`320b8c0b…`).

Worth checking: six artifacts and their order, the two CIS names, **three** upload requirements on
the two CIS Forms, six signatures scoped 2/1/0/1/1/1, acknowledgements, provenance, and that no
Health or Financials concept became a field.

## State

Permit held. Nothing pushed, no BP binding, no Enrollment, no Participant Runtime, no safeguarding
activation. Your persisted Processing decisions were added to, never altered.
