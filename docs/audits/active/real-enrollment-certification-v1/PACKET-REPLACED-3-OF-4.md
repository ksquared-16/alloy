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

| # | Packet item id | Form definition id | Pinned version id | Label |
|---|---|---|---|---|
| 0 | `747b7793-25f2-4a41-abe9-3119eb6f4cf3` | `96fad240-e6ef-4d9a-8be1-4ab8b7e049dd` | `0600c060-4380-424e-a6f4-f8ad2cabdac9` | Oregon Certificate of Immunization Status |
| 1 | `a70d488f-29b5-438e-a1e7-cd2408abd2b4` | `6fa91f1d-ba1f-46a1-977a-906d5c750f82` | `ea9b6acb-eaaa-4313-9177-038207baf403` | Oregon Nonmedical Exemption |
| 2 | `57c71883-1af6-4f2a-b0e8-d4712226ab1c` | `ea12e361-d9d7-4123-af69-ba22131623bb` | `8f9e512e-ef53-42a1-a662-297498f6b662` | School of Enrichment Admissions Packet |
| 3 | `7b88ca39-a7cf-4f2c-94ed-62b0226349ed` | `abd4e96d-3f6d-47ca-8a2e-5083820bd794` | `cbdbbd80-1302-4a58-80f1-8a7cb5fd4e91` | Tuition & Enrollment Agreement |
| 4 | `39013ba9-e3ee-41c0-a737-17ff6525fa13` | `a9a8780c-577c-452a-bea0-4b9786eb818a` | `39d23215-f6b6-4745-81f5-6d9a8fa79da9` | Parent Handbook Acknowledgement |
| 5 | `967d76ca-c07e-4aa3-b5bd-52b133fd5d7b` | `ba3e4b36-8451-4a7f-af88-41e9bcdda3ce` | `9f0500e3-552e-4285-9f28-46b3ef0c8307` | Direct Payment Authorization |

Uploads/signatures per Form: Certificate **1 upload / 2 signatures** · Nonmedical Exemption **2 uploads / 1** · Admissions Packet 0 / 0 (unsigned, still executable) · Tuition 0 / 1 · Handbook Acknowledgement 0 / 1 · Direct Payment 0 / 1.

**6 Forms, 6 published
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
