# Phase 1 — GATE P1-B: Explainability UX design

**Status:** Design package complete — **STOP for approval** before P1-C (implementation).  
**No UI code in this gate.**  
**Prerequisite:** [`enrollment_attention_phase1_gate_p1a_ux_audit.md`](./enrollment_attention_phase1_gate_p1a_ux_audit.md)  
**Canonical data:** `resolveOpportunityAttention` → `OpportunityAttentionResult` (resolver v2).

---

## 1. Design goals & constraints

| Goal | Constraint |
|------|------------|
| Calm, guided, trustworthy | No notification-center pattern; no alert stacks |
| Drawer = canonical explanation | Queue = summarize / hint / compress only |
| Deterministic copy | Templates driven by `reason_code`, `sla_tier`, `waiting.bucket`, `sla_clock_confidence` — **no AI copy** |
| Progressive disclosure | L3 never default-visible |

---

## 2. Backend contract additions (required before P1-C)

**Single source of truth in UI:** server attaches resolver output to opportunity drawer payload.

### 2.1 Recommended shape (additive JSON on entity GET)

Extend `GET /api/admin/entity/opportunities/:id` response with:

| Key | Type | Notes |
|-----|------|------|
| `_operational_attention` | `OpportunityAttentionResult \| null` | Full resolver output when evaluation succeeds |
| `_operational_attention_error` | `{ code: string; message: string } \| null` | Optional — only if resolver throws (should be rare); UI shows collapsed “Attention unavailable” |

**Computation rules (implementation detail for P1-C, locked here as contract):**

- Call **`resolveOpportunityAttention`** with same inputs as queue enrichment: opportunity row snapshot + org status defs + **`resolveOpportunityAttentionConfigFromMetadata(configSource)`**.
- **`configSource` precedence (resolve in P1-C, document in API):**
  1. Work unit metadata for `opportunity.work_unit_id` (if present and row readable).
  2. Else department metadata (infer department from work unit or explicit org rule — **open question**, see §15).
  3. Else empty metadata → platform defaults.
- Optional future: `rowContext.lastStatusTransitionAtIso` when workflow exposes it — improves SLA confidence without UI logic.

**Forbidden:** computing attention client-side from scratch; duplicating rules in React.

### 2.2 Queue row payload

No contract change required for P1-C row UX — consume existing `_attention_*` fields. Drawer **must not** depend on queue context being open.

---

## 3. Cognitive-load strategy (explicit)

| Visibility | Content |
|------------|---------|
| **Always visible (queue L0)** | One operational headline (derived from `primary_reason.label` + severity tier language); optional **single** waiting/block strip token; **one** next-step hint line (template); **no** raw score; **no** reason code strings |
| **Hidden by default (drawer L1)** | Collapsed “Operational attention” section summary: primary line + “+N more factors” + waiting one-liner + SLA state one-liner + primary next action |
| **Expand on demand (drawer L2)** | Full reason list with SLA + confidence phrasing per row; operational narrative block |
| **Advanced only (drawer L3)** | Score breakdown (`priority_breakdown`), numeric `priority_score`, raw ISO timestamps, `resolver_version`, reason codes for support |
| **Drawer only** | Full multi-reason explanations, confidence narratives, template-backed escalation hints |
| **Never on queue row by default** | Breakdown dimensions, debug JSON, resolver mechanics |

**Activity signal (`auxiliary.activity_stale`, row `stale_signal`):** Treat as **separate strip** in drawer (“Activity signal”) below operational attention — **do not merge** into resolver reason list. Queue row: prefer **one** activity OR operational hint — design choice for P1-C: operational headline wins; activity as subtler footnote if both exist.

---

## 4. Explainability panel layout (drawer)

### 4.1 Placement & hierarchy

- **Location:** Opportunity drawer — **new section** after identity / status chrome, **before** heavy workflow grids (or per layout registry — P1-C aligns with `record_drawer_layouts` / workflow v1 order if needed).
- **Section title:** “Operational attention” (calm, not “Alerts” or “Warnings”).
- **Default state:** If `needs_attention`: **L1 collapsed summary** visible (one card height). If `!needs_attention`: **compact no-attention state** (§7).

### 4.2 Wireframe — structure (desktop)

```
┌ Operational attention ─────────────────────────────── [▼ expand] ─┐
│ Summary (L1, always visible when needs_attention)                │
│ • Primary: [severity tone] Waiting on staff — SLA in warning zone   │
│ • Also: 2 other factors  ·  Waiting since Tue · Family not blocking │
│ • Next: Complete staff follow-up and log outcome                   │
│                                                                     │
│ — expanded (L2) —————————————————————————————————————————————————  │
│ Reasons                                                             │
│   ▸ Waiting on staff      Warning zone    Timing: explicit wait    │
│   ▸ Mid-funnel stale      Overdue vs goal Timing: approx. activity │
│   ▸ Follow-up passed      Overdue         Timing: commitment         │
│                                                                     │
│ Waiting & ownership                                                 │
│   Staff owes next action · Since Tue 9am                           │
│                                                                     │
│ — advanced (L3, disclosure toggle) ——————————————————————————————— │
│ Priority insight · Resolver v2                                      │
│   Score band: High · Based on severity, SLA, multiple factors       │
│   [Show breakdown] → dimension list (severity, sla, value, …)     │
└────────────────────────────────────────────────────────────────────┘
```

### 4.3 Spacing & rhythm

- Use existing AdminV2 drawer spacing tokens (`adminv2-*` / drawer section rhythm) — **no new visual system**.
- Section internal padding: comfortable vertical rhythm between **Summary**, **Reasons**, **Waiting**.
- **One** accent color family for operational emphasis (align with existing amber/warning grammar for attention lane — **do not** add red alarm for `critical` unless product explicitly demands).

### 4.4 Collapsed / expanded behavior

- **First paint:** L1 summary expanded **if** `needs_attention`; else minimal no-attention (§7).
- **Chevron:** Expands L2 (reason list + waiting block). **Secondary control:** “Advanced detail” expands L3 (score breakdown).
- **Persistence:** Optional session-only remember-expand — **nice-to-have**, not required for P1-C MVP.

### 4.5 Mobile / narrow-width

- Same content order; **stack vertically**.
- L3 breakdown: accordion rows, full-width.
- Sticky **Next** line at bottom of panel optional — defer if costly; minimum is **Next** visible in L1 without scroll when content short.

---

## 5. Multi-reason chip behavior (queue + drawer)

### 5.1 Queue row (L0) — chips are **not** a rainbow wall

**Primary:** One **text headline** (not a pill unless severity warrants subtle pill):

- Format: `{urgencyWord}: {shortPrimaryLabel}`  
  - Examples: “Needs review: Waiting on staff” · “Due soon: Follow-up passed” · “Blocked: Internal hold”

**Secondary compression:**

- If `reasons.length > 1`: trailing **muted text link or suffix**: “+2 factors” (not 3 separate badges).
- **No** per-reason chips on row by default.

**Severity → language (not raw enum):**

| Severity | Row headline prefix (calibrated) |
|----------|-----------------------------------|
| critical | “Urgent” |
| high | “Needs review” |
| medium | “Watch” / “Follow up” |
| low | “FYI” (rare on attention queue) |

### 5.2 Drawer L2 — reason rows as **calm list**, not chips

- Each line: **Label** · **SLA state phrase** · **timing confidence glyph + tooltip** (see §8).
- Avoid colored chip per row; use **left rule** or typographic weight for primary line only.

### 5.3 Overflow

- More than 5 reasons (edge): show 5 + “Show all (N)” — unlikely at current taxonomy scale.

---

## 6. Waiting-state UX

### 6.1 Distinction from stale

- **Waiting / blocked:** nouns imply **pause with owner** — copy uses **“Waiting on …” / “Blocked …”**.
- **Stale:** copy uses **aging / touch / follow-up** language — never “waiting” unless `waiting_on_*` is also active.

### 6.2 Bucket → presentation

| `wait_bucket` | Row token (short) | Drawer line |
|---------------|-------------------|-------------|
| `waiting_on_family` | “Family” | “Waiting on family response” |
| `waiting_on_staff` | “Staff” | “Waiting on staff action” |
| `waiting_on_documents` | “Docs” | “Waiting on documents” |
| `waiting_on_payment` | “Payment” | “Waiting on payment” |
| `blocked_internal` | “Internal block” | “Blocked internally” |
| `blocked_external` | “External block” | “Blocked externally” |
| `none` | — | Omit waiting strip |

### 6.3 Visual distinction (calm)

- **Waiting strip:** neutral/outline pill or **prefix icon** (single style for all wait types).
- **Blocked:** slightly stronger emphasis (outline + label “Blocked”) — **not** error red by default.
- **Ownership:** drawer “Waiting & ownership” subblock states **who owes next action** (derived from bucket + optional `next_expected_action_owner` from metadata when present).

---

## 7. SLA + timing confidence UX

### 7.1 SLA tier → operator language

| `sla_tier` | Phrase |
|------------|--------|
| `ok` | “Within expected window” |
| `approaching` | “In warning zone” / “Due soon” |
| `breached` | “Past due” / “Overdue vs goal” |

Avoid numeric hour counts on L1 unless confidence is high.

### 7.2 Confidence → copy + UI affordance

| `sla_clock_confidence` | User-facing pattern |
|----------------------|---------------------|
| `high` | “Since [relative date]” from explicit `wait_since` — **no** “approx” |
| `medium` | “Based on last status change” (when transition timestamp wired) |
| `low` | “Timing approximate · based on latest record activity” — **never** fake precision |

**Tooltip on ℹ️:** One sentence: “We infer timing from …” matching confidence.

### 7.3 Combined examples (drawer line)

- High: “Waiting since yesterday”
- Low: “Likely inactive ~5 days · based on latest activity”
- Commitment breach: “Follow-up date passed · commitment overdue”

---

## 8. Deterministic next-step guidance

**Source:** Template map keyed by **`primary_reason.code`** with optional modifiers when `waiting.active`.

**Rules:**

- One **primary** next-step line in L1.
- Optional **secondary** bullets in L2 (max 3).

### 8.1 Template table (examples — implementation as keyed strings in P1-C)

| `reason_code` | Primary next-step (example) |
|---------------|-----------------------------|
| `follow_up_date_passed` | “Schedule or complete follow-up with family.” |
| `tour_date_passed` | “Complete tour follow-up and update next step.” |
| `overdue_commitment` | “Resolve overdue commitment or set a new date.” |
| `missing_quote_after_execution` | “Finish and send enrollment offer.” |
| `stale_quote_followup` | “Check in on pending decision.” |
| `missing_identity` | “Link household contact before proceeding.” |
| `high_value_stale` | “Re-engage high-value inquiry.” |
| `mid_funnel_stale` | “Advance or document why pipeline is paused.” |
| `stale_new_inquiry` | “Respond to new inquiry within policy.” |
| `stale_qualified` | “Move qualified lead forward or update status.” |
| `waiting_on_family` | “Follow up when appropriate; confirm family received request.” |
| `waiting_on_staff` | “Staff: complete outstanding action.” |
| `waiting_on_documents` | “Request or process outstanding documents.” |
| `waiting_on_payment` | “Confirm payment status or send reminder.” |
| `blocked_internal` | “Resolve internal blocker or reassign owner.” |
| `blocked_external` | “Track external dependency or escalate.” |

**Compound modifier:** If both `waiting_on_family` and stale reasons exist, L2 shows both; L1 next-step prefers **ownership**: staff-blocking reasons beat family-wait when `blocked_internal` / `waiting_on_staff` in primary.

---

## 9. Queue readability — additive improvements (L0 design)

**Scope:** Adjust **presentation** of existing CRM-compact row fields only — **no** new queue architecture.

| Addition | Behavior |
|----------|----------|
| **Operational summary line** | Replace plain `_attention_reason_label` dump with headline pattern (§5.1) + severity language |
| **Waiting token** | When `_attention_waiting_bucket !== none`, append subtle “ · Staff wait” style token |
| **Secondary compression** | When `reasons.length > 1`, append “+N factors” (parse `_attention_reasons_detail` length client-side — **display only**) |
| **Urgency emphasis** | Map `_attention_severity` to existing pill **tone** or border-left **4px** accent — **one** accent per row |
| **Activity vs operational** | If operational headline present, render `activityStale` as **smaller footnote** below fold or trailing muted text — reduce dual prominence |

**Do not:** add score number; add multiple colored badges; expand full reason list inline.

---

## 10. Concrete examples — queue rows (text mockups)

### 10.1 Low severity / single factor

```
Rivera · Qualified · Contacted
Watch: Priced follow-up is stale
Next: Check in on pending decision
```

### 10.2 Blocked internal

```
North campus tour · Tour scheduled
Needs review: Blocked internally · Staff
Next: Resolve internal blocker or reassign owner
```

### 10.3 Waiting on family

```
Kim inquiry · Contacted
Follow up: Waiting on family · +1 factor
Next: Confirm family received request
```

### 10.4 High-value stale

```
Martinez · Ready to enroll
Needs review: High-value stale · Staff
Next: Re-engage high-value inquiry
```

### 10.5 Multiple reasons (compression)

```
Lee · Waitlisted
Needs review: Waiting on staff · +2 factors
Next: Staff: complete outstanding action
```

### 10.6 SLA breached (row stays calm)

```
Patel · Application in progress
Needs review: Past due vs goal · Docs
Next: Request or process outstanding documents
```
*(“Past due vs goal” derived from worst `sla_tier` among reasons — template, not raw tier enum.)*

---

## 11. Concrete examples — drawer states

### 11.1 No attention

```
Operational attention
No active operational exceptions for this inquiry.
Last evaluated: Today 9:41 AM · Enrollment rules (site queue)
[Collapsed by default; optional ℹ️ links to cohort semantics doc for power users — defer]
```

### 11.2 One reason

```
Operational attention
Primary: Waiting on staff — In warning zone
Next: Staff: complete outstanding action
[Expand] Reasons (1) …
```

### 11.3 Multi-reason

```
Primary: Waiting on staff — In warning zone
Also: Mid-funnel stale · Follow-up date passed
Next: Staff: complete outstanding action

Expanded:
  Waiting on staff    Warning zone    Timing: explicit wait · Since Tue
  Mid-funnel stale    Past due        Timing: approximate · Latest activity
  Follow-up passed    Past due        Timing: commitment
```

### 11.4 Waiting + stale

Same as multi-reason; narrative line: “Pipeline aging while waiting — both need visibility.”

### 11.5 Low confidence SLA

```
Mid-funnel stale    Past due vs goal
Timing: approximate · based on latest record activity ℹ️
```

### 11.6 Escalated operational issue

Use language “Escalated priority” only when **worst** SLA tier breached **and** severity `critical` OR policy flag future — **P1-C uses**: breached + high/critical → headline “Urgent” without alarm chrome.

---

## 12. Narrow-width / mobile degradation

| Element | Behavior |
|---------|----------|
| Summary | Full width; **Next** stays visible |
| Reason list | Stack; truncate labels with ellipsis + full label on tap |
| Advanced | Collapsed by default; breakdown as accordion |
| Chips | **Avoid** horizontal scroll chip rails |

---

## 13. Empty & edge states

| State | UX |
|-------|-----|
| `needs_attention === false` | Friendly neutral panel (§11.1) |
| Resolver error | “Could not load operational summary” + retry drawer refresh — **no** fake data |
| Missing `_attention_*` on queue (non-enrichment path) | Row falls back to today’s label-only behavior |
| Drawer payload missing `_operational_attention` pre-P1-C ship | Hide section or show “Update required” — **must not** ship broken gap |

---

## 14. Design rationale

- **Drawer-first** concentrates cognitive load where operators already pause to act.
- **Tiered disclosure** protects scanning speed for directors on large queues.
- **Template-driven next steps** preserve deterministic trust and auditability.
- **Confidence honesty** prevents false precision that erodes adoption — critical for “director daily driver” bar.

---

## 15. Unresolved UX questions (for P1-C / product)

1. **Config precedence** when opportunity has `work_unit_id` null or mismatched — fallback department list?
2. **Should “Operational attention” appear** when `needs_attention` false but `auxiliary.activity_stale` present? Proposal: **separate small “Activity” strip**, not merged.
3. **Localization** — English-only templates for P1-C acceptable?
4. **Permissions** — any role should see advanced breakdown or restrict to admin?
5. **Histogram lane block** — update copy to “reason-level counts” per GATE 3 follow-up — parallel UI task.

---

## 16. P1-C implementation recommendations (checklist)

1. **Backend:** Attach `_operational_attention` in `respondOpportunityEntityGet`; implement config precedence decision; tests for drawer payload shape.
2. **Drawer:** New presentational section component consuming `_operational_attention` only — **no** resolver imports in leaf components.
3. **Templates:** Central module `operationalAttentionCopy.ts` — maps codes/tiers/confidence → strings; unit tests for snapshots.
4. **Queue:** Update `CrmCompactQueuePreview` / semantic slots assembly to L0 headline pattern using existing row JSON.
5. **Activity:** De-emphasize dual signal per §3.
6. **Telemetry:** Optional expand rate logging later — not required P1-C.
7. **Docs:** Link execution histogram copy updates to lane UI when touched.

---

## 17. Files for this gate

| File | Action |
|------|--------|
| `docs/sprints/archive/05_2026/enrollment_attention_phase1_gate_p1b_explainability_design.md` | **Created** (this document) |
| `docs/sprints/archive/05_2026/enrollment_operational_attention_v2_sprint.md` | **Update** gate row → P1-B complete pending approval |

---

## 18. STOP

**No UI implementation until P1-B is explicitly approved.**  
Next: **GATE P1-C** — incremental implementation per §16.
