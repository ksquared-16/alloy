# Post-V1 programs, and the operator click path

**Run:** `erun_fcc1b6e7c5024b0d` · Bounded visual pass done · **BP untouched**

## The canonical distinction, preserved

```
Processing understands semantically across the packet
  → Participant Runtime executes ordered Forms with shared values carried forward
    → review and signature remain artifact-based
```

Nothing in this pass claims otherwise. That is the point of the copy changes below.

## What changed

| Was | Now | Why |
|---|---|---|
| “Saved pipeline” | **Included forms** — *5 forms · the order a family meets them, and the order they are reviewed in* | The operator's question is which artifacts are in the packet |
| “Step composition — build the ordered intake flow” | **Confirm order** — *Processing already chose the forms — change the order here if it should read differently* | Order stays (runtime-significant); rebuilding does not |
| “Distribution — send or publish this intake workflow” | **Send this packet directly** — *Configured processes such as Enrollment launch their participant work automatically* | The old title implied Enrollment needs a manual launch. B1 disproved that |
| “Sessions & review” | kept, *…whether it was sent directly or launched by a process* | It is the review surface for both routes in |
| “Held for another area” at the top | collapsed disclosure below the packet | Real and provable, but not the headline |

**Visual.** The subtle one: `alloy-pine` is **not** Bend Pine. `globals.css` states it plainly —
*"Do NOT reuse `alloy-pine` — it is Midnight Forge's value under a [misleading] name"* (`#273F52`,
navy) — and the session-inbox link was wearing it. Primary action now states Bend Pine directly
rather than inheriting the shared `PrimaryButton`'s `bg-alloy-blue` (that component is used app-wide
and was left alone). Pine checkbox accent; the established card border on the three major sections.

A control pins that `alloy-pine` really is the trap, so these assertions cannot quietly start
measuring the wrong token.

## The three post-V1 programs

### R1 — Semantic Packet Runtime
Compile packet-wide semantic needs **before** the conversation; collect or confirm each shared fact
once; project answers back into the ordered artifacts; preserve per-artifact review and signature.
This is the runtime change that would make a semantic Studio presentation *true* — which is why the
Studio reframe waits on it rather than leading it.

### R2 — Packet Readiness
Durable readiness derived from analysis reconciliation, ownership decisions, and
artifact/upload/signature validity — rather than `is_active`, which is all
`form_packet_definitions` carries today. The parts exist; the expression does not.

### R3 — Household / Multi-child Ask-once
Certify whether canonical household-grain facts collected for one child are reused automatically in a
sibling's separate Enrollment journey. **Proof first** — sharing across *recipients* of one packet
already works (`packet_instance_id`, `householdOnly`); sharing across *sibling journeys* is unproven
in either direction. Design new sharing only if the real proof fails.

## The operator click path

1. **Sign in** — `http://127.0.0.1:3014/login` (IP literal; `localhost` returns you to login).
2. **Organization → Processes → Enrollment → Stages.**
   Rail should read **All · Family Track · Child Track**, with *"8 stages in the whole process"* under
   All. *If those pills are missing, stop — that is the track fix failing.*
3. **Child Track → Enrolling.**
4. **Requirements** (starts collapsed) → **Enrollment paperwork** → **Change paperwork** →
   **Use a packet** → **School of Enrichment — Enrollment Packet**.
   One selection compiles all five in certified order.
5. **Begin new enrollments in Enrolling** — authors `enrollment_start → enrolling`.
6. **Validate**, then **Publish**.

I performed none of these; they are yours.

Then tell me and I verify from tenant state: stored-draft diff (only the two authorized additions plus
the 14 documented normalization changes, description intact), revision 1, the five effective
requirements, and the requirement-derived packet against Studio packet `579327c1` — 5 forms, certified
order, 3 uploads, 5 signatures, 0 bank-credential asks, zero drift.

## Certification boundary — unchanged

V1 is the **normal path** and ends at successful paperwork completion and evidence.
**Enrolling → Enrolled advancement, Form-requirement transition enforcement, waiver/exception,
canonical Consent and Financials remain post-V1** — named follow-ons, not silent omissions.
