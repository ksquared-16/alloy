# P1-C — UX review package (screenshots + self-audit)

**Purpose:** Package implementation evidence and a **Cursor self-review** for human UX approval.  
**This document does not constitute sign-off** — final UX approval remains a human step.

**How screenshots were produced**

- Fixture gallery (resolver-shaped payloads + CRM-compact slots modeled on enrollment demo families): dev-only route  
  `/dev/p1c-operational-attention-review` (`web/app/dev/p1c-operational-attention-review/`).
- **Production builds:** that route returns **404** (`notFound()`).
- **Regenerate PNGs** (requires dev server on `127.0.0.1:3000`): from `web/` run  
  `npm run dev` in one terminal, then `npm run screenshots:p1c-review` in another.

**Related:** Implementation checklist — [`enrollment_attention_phase1_gate_p1c_implementation_notes.md`](./enrollment_attention_phase1_gate_p1c_implementation_notes.md)

---

## 1. Screenshot index

All assets live under [`assets/p1c-review/`](./assets/p1c-review/).

### Queue (CRM compact)

| # | File | Description |
|---|------|----------------|
| Q1 | [queue-single.png](./assets/p1c-review/queue-single.png) | One operational headline (Patel · Contacted). |
| Q2 | [queue-multi-factors.png](./assets/p1c-review/queue-multi-factors.png) | **+2 factors**, **Staff wait**, muted activity stale (Nguyen · Tour scheduled). |
| Q3 | [queue-wait-token.png](./assets/p1c-review/queue-wait-token.png) | **Family wait** token (Chen · New inquiry). |
| Q4 | [queue-next-line.png](./assets/p1c-review/queue-next-line.png) | **Next:** operational hint emphasized (Rivera · Ready to enroll). |

### Drawer (operational attention panel)

| # | File | Description |
|---|------|----------------|
| D1 | [drawer-no-attention.png](./assets/p1c-review/drawer-no-attention.png) | Calm empty state + resolver meta line. |
| D2 | [drawer-single-reason.png](./assets/p1c-review/drawer-single-reason.png) | Single primary factor + Next card. |
| D3 | [drawer-multi-reason.png](./assets/p1c-review/drawer-multi-reason.png) | Multi-reason summary collapsed. |
| D4 | [drawer-expanded-factors.png](./assets/p1c-review/drawer-expanded-factors.png) | Factor list + timing phrases expanded. |
| D5 | [drawer-advanced-breakdown.png](./assets/p1c-review/drawer-advanced-breakdown.png) | Advanced numeric breakdown visible. |
| D6 | [drawer-narrow-wrap.png](./assets/p1c-review/drawer-narrow-wrap.png) | Same drawer shell at **320px** max width. |

---

## 2. Self-review vs UX criteria (by screenshot)

**Legend — severity:** minor · moderate · major

### Queue shots (Q1–Q4)

| Shot | Glanceable / calm / “what matters now” | Density | Issues | Severity |
|------|----------------------------------------|---------|--------|----------|
| **Q1** | Primary line reads quickly; single factor is easy to parse. | Acceptable. | Headline length grows with long labels — monitor real data. | minor |
| **Q2** | **What matters** is front-loaded; **+2 factors** communicates breadth without a chip wall. | Slightly taller row (attention + Next + stale footnote). | Three signals (headline, Next, stale) compete more than Q1; footnote mute helps but still **dual narrative** (resolver vs activity). | moderate |
| **Q3** | **Family wait** gives ownership quickly. | Good. | “Follow up:” prefix + family wait may feel verbose on narrow cards — consider ellipsis rules in a polish pass. | minor |
| **Q4** | **Next:** line makes operational intent obvious when lifecycle “Next step” strip is absent. | Good. | Long template strings wrap to two lines — acceptable; watch for three-line stacks at scale. | minor |

### Drawer shots (D1–D6)

| Shot | Explains vs “debug” | Calm | Issues | Severity |
|------|---------------------|------|--------|----------|
| **D1** | Clearly **product** copy, not instrumentation. | Very calm. | None material. | — |
| **D2** | Narrative + Next card reads operational. | Calm. | SLA phrase appended on primary line is dense — still acceptable. | minor |
| **D3** | Summary + **+N** + ownership works. | Calm. | Toggle labels (“Show operational factors”) are utilitarian — fine for v1; could soften wording later. | minor |
| **D4** | Timing lines build trust without raw ISO. | Good. | Multiple **medium/low confidence** phrases repeat structure — slight fatigue risk on busy records. | minor |
| **D5** | **Feels closest to debug** — dimension labels + numeric points echo engineering semantics (“severity”, “sla”). | Acceptable because **hidden by default** in real drawer usage; fixture forces it open for review. | Consider future copy pass: rename dimensions for operators or fold into a single “priority insight” sentence. | moderate |
| **D6** | Wrapping behaves; no horizontal spill in fixture. | Readable. | Narrow column stacks **Next** card + toggles — acceptable; real Admin drawer width usually wider. | minor |

### Cross-cutting

- **Next-step language:** Generally **operational** (“Staff owes…”, “Advance the pipeline…”). Some lines are long — **minor** risk of sounding template-heavy when multiple sentences concatenate (see `nextStepGuidance` when wait bucket compounds).
- **Robotic tone:** Low but non-zero when the same pattern repeats row-to-row at scale — **minor**; mitigated later by variable copy tiers (not in scope now).

---

## 3. Cognitive-load audit

| Dimension | Assessment |
|-----------|------------|
| **Badge density** | **Low.** Queue avoids per-reason chips; single headline + optional **Next:** line + one activity pill at most. |
| **Visual hierarchy** | **Strong enough for v1.** Title row → optional lifecycle next strip → operational headline → Next hint → muted stale. Drawer: primary → Next card → disclosures. |
| **Repeated colors** | Queue stale pills still use amber/risk grammar; operational headline is mostly **typographic** (good). Drawer avoids rainbow severity pills. |
| **Operational scanability** | At lane scale, directors scan **family name + status pill + first operational line** — viable. Worst case is Q2-class rows with headline + Next + stale. |
| **Queue readability at scale** | **Moderate risk** when many rows carry both resolver headline + activity stale + notes footer — density driven by **existing** footer more than P1-C additions. |
| **Progressive disclosure** | **Effective:** factor list and numeric breakdown are not default-visible in the live drawer component; this gallery includes forced-open panels **only** for evidence. |

**Hidden by default (live drawer)**

- Full factor list (toggle).
- Advanced priority breakdown (toggle).
- Raw resolver mechanics / codes (not shown in UI).

**Expanded on demand**

- Operational factors list + per-row timing phrase.
- Advanced dimension points.

**Still potentially overloaded**

- Rows combining attention + activity + notes + last activity (pre-existing composition) — **monitor in human review**.

---

## 4. Responsive / narrow-width audit

| Check | Result (fixture + implementation intent) |
|-------|-------------------------------------------|
| **Wrapping** | **D6** shows headline and body text wrapping inside 320px without clipping. |
| **Drawer readability** | Acceptable at narrow width; primary risk is long **Next** templates — they wrap rather than overflow. |
| **Chip compression** | **N/A** — deliberate avoidance of chip walls; queue uses compressed **text** suffixes (**+N factors**, **Staff wait**). |
| **Horizontal overflow** | No overflow observed in fixture captures; queue card uses `max-w` shell in gallery (real route uses list layout). |
| **Stacked visual chaos** | **Low** in drawer; **medium** on queue rows when footer + activity + operational hint all present — see Q2. |

---

## 5. Remaining known follow-ups (non-blocking)

Tracked for future work — **do not block** human UX review:

1. **Department metadata fallback** when `work_unit_id` is missing (config parity edge case).
2. **`activityStale` via resolver `optionalSignals`** on entity GET — drawer **Activity signal** strip fully populated from workflow rules.
3. **Per-row urgency tier** from `_attention_severity` (today lane tier remains queue-meta driven).

---

## 6. Human review checklist (quick)

- [ ] Queue: scan 20+ real rows on a seeded work unit — fatigue level acceptable?
- [ ] Drawer: open 5 inquiries with multi-reason — toggles discoverable?
- [ ] Director test: “what do I do next?” answered in **< 10 seconds** without opening Advanced?
- [ ] Narrow laptop drawer width — wrap acceptable?

---

**Stop line:** Human UX approval recorded separately (ticket / PR comment / design review).
