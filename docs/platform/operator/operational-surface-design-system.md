# Alloy OS — System 5 — Operational Surface Design System

**Revision:** 2  
**Status:** Approved / frozen (June 2026) — canonical platform doctrine  
**Authority:** Visual and compositional law for every operational surface in Alloy OS.

---

## Position in the Alloy OS system stack

| System | Owns | Doc |
|--------|------|-----|
| **System 1** | Runtime behavior — Workspace → Perspective → Queue → Row → Focus Panel → Mode → Card | [`alloy-runtime-specification.md`](./alloy-runtime-specification.md) |
| **System 1.5** | Operational surface geometry — Queue · Focus Panel · BOS peers | Runtime Spec Part 3 |
| **System 2** | Queue UX — compressed row, grain-aware fields | Runtime Spec Part 4 |
| **System 3** | Focus Panel shell — header chrome, mode control, scroll contract | Runtime Spec Part 5 |
| **System 4** | Universal Card primitive — anatomy, tiers, density, grid engine | [`universal-card-system.md`](./universal-card-system.md) |
| **System 5** | **Operational Surface Design** — how cards, headers, modes, color, density, and embedded workspaces **look and compose** | **This document** |
| **System 5A** | Universal Card Archetypes | [`universal-card-archetypes.md`](./universal-card-archetypes.md) |
| **System 5B** | Card interaction & expansion | [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md) |
| **System 5C** | Content templates & field inclusion | [`card-content-template-field-inclusion-doctrine.md`](./card-content-template-field-inclusion-doctrine.md) |
| **Operational Mode** | Default Work Unit state — subject resolution, Browse retirement | [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md) |

**System 5 does not replace Systems 1–4.** It is the missing layer between runtime doctrine and pixels. After System 5, engineers implement — they do not invent UI.

**System 5A** extends System 5 with purpose-specific **Universal Card Archetypes** — see [`universal-card-archetypes.md`](./universal-card-archetypes.md).

**System 5B** defines **card interaction models** (Expand, Embedded Workspace, Drill View, Change Subject, External) — see [`card-interaction-expansion-doctrine.md`](./card-interaction-expansion-doctrine.md).

**System 5C** defines **content templates and field inclusion** — see [`card-content-template-field-inclusion-doctrine.md`](./card-content-template-field-inclusion-doctrine.md).

**Operational Mode** (default Work Unit state) is defined in [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md) — condensed queue, resolved subject, auto-open Focus Panel.

**Cross-references:** [`alloy-visual-language.md`](./alloy-visual-language.md) · [`canonical-interaction-model.md`](./canonical-interaction-model.md) · [`universal-card-system.md`](./universal-card-system.md) · [`alloy-os-runtime-completion.md`](./alloy-os-runtime-completion.md) · [`operational-mode-default-state-doctrine.md`](./operational-mode-default-state-doctrine.md)

---

## 1. Operational Surface Philosophy

Operators do not navigate records. **Operators execute work.**

Every operational surface must answer five questions — in this order of scan priority:

| # | Question | Primary carriers |
|---|----------|------------------|
| 1 | **What am I looking at?** | Header subject, role/type, business process |
| 2 | **What needs my attention?** | Tier 1 Attention cards, status chips, warm rails |
| 3 | **What should I do next?** | Primary header action, Work mode checklist, card actions |
| 4 | **What happened recently?** | Activity mode, timeline, communications context |
| 5 | **What can BOS help me do?** | BOS rail (peer surface — not Focus Panel) |

**Law:** Meaning before schema. Progress before fields. One business question per card. White canvas; color communicates tier and status only.

---

## 2. Operational Hierarchy

Visual hierarchy is **frozen**. Configuration may reorder cards **within** a tier. Configuration may not demote a card above its tier ceiling or promote a card above its natural tier without explicit Experience Builder tier assignment.

### Tier 1 — Execute now

Mission · Attention · Current Work

These cards occupy the first scan row in Summary and the top of Work mode. They use the strongest typographic weight and may use warm (attention) or pine (work) accent rails.

### Tier 2 — Health and readiness

Health · Readiness · Tour · Billing (when present)

Metric-tier cards. Compact density. Specific issues, not generic counts. Blue accent for neutral metrics; status chips for blocked/at-risk.

### Tier 3 — Context summaries

Children · Household · Communications · Documents · Billing setup

Reference and context tiers. Summary-only at default density. Never field dumps. Communications is **context**, not inbox, in Summary.

### Tier 4 — History and audit

Timeline · Notes · Workflow History · Audit

Historical tier. Purple/violet rail accent. Expanded only in Activity mode or on explicit expand.

**Law:** Summary mode never leads with Tier 4. Activity mode never leads with Tier 1 execution cards.

---

## 3. Universal Card Grammar

Every operational card shares **identical anatomy**. Cards answer **one business question**. Cards are never field containers.

### Required elements (scan order)

1. **Icon** — tier-colored, 16px, left of title row  
2. **Title** — business question category (1–3 words)  
3. **Status chip** — when tier/status is meaningful (optional for neutral reference)  
4. **Primary insight** — meaning-first answer (required)  
5. **Supporting insight** — progress detail, second line (optional, max 1 line)  
6. **Primary action** — text action, footer or inline (optional, max 1 per card)

### Optional elements

- **Badge** — count or blocker count (status chip may absorb this)  
- **Expand body** — drill detail, embedded workspace (Activity / expanded density only)  
- **Secondary metrics** — micro numbers inside metric-tier cards only

### Prohibited

- Raw field grids as card body  
- Layout section names as card titles (`Source`, `Overview`, `Enrollment Fields`)  
- More than one primary action per card  
- Filled color card backgrounds  
- Empty oversized card interiors

---

## 4. Universal Card Anatomy (tokens)

Platform-owned. Not configurable.

| Token | Value | Notes |
|-------|-------|-------|
| Card background | `#FFFFFF` | Always white on operational canvas |
| Card border | `#E5E9EF` | Quiet neutral |
| Card radius | `10px` | Matches Alloy OS card radius |
| Accent rail width | `2px` (work/context/reference/history), `3px` (critical) | Left border only |
| Grid gap | `12px` | Focus Panel card grid |
| Grid padding | `12px` | Focus Panel body inset |

### Padding by density

| Density | Header padding | Body padding | Footer padding | Target height |
|---------|----------------|--------------|----------------|---------------|
| Micro | `8px 10px` | — | — | 56–88px |
| Compact | `8px 12px 4px` | `0 12px 8px` | `6px 12px 8px` | 96–160px |
| Standard | `10px 12px 6px` | `0 12px 10px` | `8px 12px 10px` | 160–360px |
| Expanded | `10px 12px 6px` | `0 12px 10px` (scroll cap 360px / 45vh) | `8px 12px 10px` | 360px+ |

### Typography

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Title | 12px | 600 | Midnight `#273F52` |
| Primary insight | 13px (compact+), 18px (micro metric) | 500–600 | Midnight |
| Supporting insight | 12px | 400 | Secondary `#4B5563` |
| Status chip | 10px | 600 | Tier/status color, outline not fill |
| Action text | 12px | 600 | Pine `#00A283` primary; secondary `#4B5563` |

### Icon placement

- 16×16px, stroke 1.75, left of title in header row  
- Color follows tier (see §6)  
- One icon per card; no decorative icon stacks

### Action placement

- **Summary / compact cards:** footer, right-aligned or full-width text button  
- **Primary next action (Work):** action-row card treatment — subtle pine tint, no filled block  
- **Micro cards:** no footer action (tap card or header action instead)

### Maximum density rules

| Constraint | Limit |
|------------|-------|
| Primary insight lines | 2 (ellipsis after) |
| Supporting insight lines | 1 |
| Primary actions | 1 |
| List items in body (tasks, blockers) | 3 visible + overflow hint |
| Status chips | 1 |

---

## 5. Card Tier System

System 5 maps System 4 tiers to **card roles** (`data-card-role`) and visual treatment.

| Tier (System 4) | Role (System 5) | Purpose | Rail | Icon treatment |
|-----------------|-----------------|---------|------|----------------|
| Attention | `critical` | Why now, urgency | Warm `#D97706` 3px | Warm stroke |
| Work | `active-work` | Mission, steps, blockers, launcher | Pine `#00A283` 2px | Pine stroke |
| Metric | `metric` | Health, readiness, KPI glance | None | Blue `#0369A1` stroke |
| Context | `context` | Tour, comms summary, documents summary | Neutral 1px | Gray stroke |
| Reference | `reference` | Household, children summaries | Neutral 1px | Gray stroke |
| Historical | `history` | Timeline, notes, audit | Violet `#7C3AED` 1px | Violet stroke |

### Badge behavior by tier

| Tier | Badge |
|------|-------|
| Critical | Required when signal present (`at-risk`, `blocked`, overdue) |
| Active work | State chips (`open`, `due`, blocker count) |
| Metric | Readiness/health status only |
| Context / Reference | Optional count badge |
| History | Event count optional |

### Action behavior by tier

| Tier | Default action pattern |
|------|------------------------|
| Critical | `View details →` |
| Active work | `Open work →` / `Resolve →` |
| Metric | `View health →` / none when ready |
| Context | `View … →` (domain-specific) |
| Reference | `View household →` / `View children →` |
| History | Expand to embedded workspace |

---

## 6. Color Language

**Color communicates meaning. Never decoration.**

| Meaning | Token | Usage |
|---------|-------|-------|
| Critical / attention | Warm orange `#D97706` | Accent rail, at-risk chip border |
| Active work / primary action | Bend pine `#00A283` | Work rail, primary action text, header primary button |
| Metrics / informational | Blue `#0369A1` | Metric icons, due chip |
| Reference / neutral | Gray `#4B5563` | Secondary text, neutral chips |
| History | Violet `#7C3AED` | History rail, audit/timeline icons |
| Blocked / error | Red `#B91C1C` | Blocked chip outline |
| Canvas | White `#FFFFFF` | Card and Focus Panel background |
| Border | `#E5E9EF` | Card border, quiet separation |

**Prohibited:** filled orange/green/blue card backgrounds; random colored sections; color as branding decoration inside Focus Panel body.

**Preferred pattern:** white card + quiet border + accent rail + outline status chip + pine action text.

---

## 7. Information Density

Cards must feel **dense and operational**, never empty.

| Card | Primary insight | Supporting insight | Body | Action |
|------|-----------------|-------------------|------|--------|
| Why Now | Specific reason | Idle duration or secondary reason | Never | View details → |
| Current Mission | Mission statement | Stage purpose one-liner | Never at compact | View mission → |
| Current Work | Active work label | State (open/due/completed) | Never at compact | Open work → |
| Health | Headline assessment | Blocker/task summary | Never at micro | View health → |
| Readiness | Specific blockers | Named blocker when available | Never at micro | Resolve → |
| Tour | Scheduled time or none | Location if known | Never | Schedule tour → |
| Household | Primary contact | Relationship/context | Never at compact | View household → |
| Children | Count enrolling | Names (max 2 + overflow) | Never at compact | View children → |
| Communications (Summary) | Latest outreach state | Thread hint | Never | View communications → |
| Documents (Summary) | Forms/blockers summary | Count outstanding | Never | View documents → |
| Required Information (Work) | Named blocker | Count | Max 3 items | Resolve blockers → |
| Work Launcher | Intent line | — | 3 launcher rows | Per-row affordance |
| Timeline (Activity) | Recent event count | — | Embedded feed | — |
| Communications (Activity) | Latest thread summary | — | **Embedded Communications workspace** | — |

**Law:** Readiness names blockers; it does not show generic "2 blockers" without context when a primary reason exists.

---

## 8. Operational Storytelling

Cards tell **progress stories**, not schema labels.

| ❌ Schema | ✅ Story |
|-----------|---------|
| Mission: Lead | Mission: Schedule tour · Waiting for family response |
| Health: Needs attention | Health: 1 blocker, 1 overdue task |
| Readiness: 2 blockers | Readiness: Medical form outstanding |
| Current Work: Review lead | Current Work: Review lead · Due today |
| Tour: — | Tour: No tour scheduled |

Every insight line should answer: **what is the state, and what changed?**

Implementation derives stories from VM summaries, attention, trust preview, and record responders — never from layout section keys.

---

## 9. Header Language

Focus Panel header establishes **operational context only**. Fixed height band (~44–48px subject row + mode row). No breadcrumbs. No metadata dumps.

### Required (scan order)

1. **Subject** — record identity (family name, person name)  
2. **Role / type** — entity singular (`Lead`, `Enrollment`)  
3. **Business process** — process or stage label when relevant  
4. **Mission line** — one line, ellipsis (perspective mission or stage purpose)  
5. **Stage** — current stage chip when distinct from process  
6. **Context chip** — location/campus when scoped  
7. **Status** — progressive status control  
8. **Primary action** — single pine button (header owns duplicate next-action)  
9. **Secondary actions** — Manage, BOS-adjacent controls (compact)

### Mode control

Summary · Work · Activity — integrated below subject band. Mode persists across record swap within session.

---

## 10. Summary Mode Composition

**Executive briefing.** Three visual bands:

**Band A — Execute (Tier 1 + health glance)**  
Row 1: Why Now · Current Mission · Current Work · Health (micro)  
Row 2: Readiness (micro) · Tour

**Band B — Context (Tier 3)**  
Row 3: Household · Children (2-col)  
Row 4: Communications (full row, summary only)  
Row 5: Documents (full row, summary only)

Expand drills are optional and must not replace summary scan lines.

---

## 11. Work Mode Composition

**Execution checklist.** Vertical stack:

1. Why Now (when attention visible)  
2. Current Step — workflow stage rail  
3. Required Information / blockers  
4. Work Launcher — Manual · BOS Assist · Import/Intake  
5. Tasks · Automations (2-col)  
6. Primary Next Action — **hidden when header primary action present**

Work Launcher rows: label + description + action affordance per row. No bullet text.

---

## 12. Activity Mode Composition

**Historical workspace.**

1. Timeline (expanded, full row)  
2. Communications · Documents (2-col) — Communications embeds existing Communications workspace on expand  
3. Notes · Workflow History (2-col)  
4. Audit

### Communications in Activity

- **Reuse** `CommunicationsDrawerSection` — no duplicate messaging UI  
- Embed inside expanded Communications card body  
- Summary and Work modes: context line only — **no composer by default**  
- Message sending remains header-action-driven or Inbox-driven  
- Activity provides historical communication context, not a second inbox destination

---

## 13. Embedded Workspace Doctrine

These are **workspaces**, not new runtime primitives. They embed on card expand in Activity (or explicit drill):

| Workspace | Embed trigger | Component family |
|-----------|---------------|------------------|
| Communications | Activity → Communications card (expanded) | Communications workspace |
| Documents | Activity → Documents card | Documents tab panes |
| Notes | Activity → Notes card | Notes tab panes |
| Timeline | Activity → Timeline card | Activity feed |
| Billing | Future card expand | Billing workspace |
| Scheduling | Future card expand | Scheduling workspace |

**Law:** Do not recreate workspace UX inside cards. Wrap existing workspace components.

---

## 14. Configuration Boundary

| Owner | Owns |
|-------|------|
| **Experience Builder** | Card order within tier, visibility, span, density preset, mode default |
| **Business Processes** | Which cards appear, mission copy, workflow entry points, perspective metadata |
| **System 5 (platform)** | Spacing, typography, color, grammar, hierarchy, card anatomy, icon language, interaction language, mode composition templates, header language |
| **System 4 (platform)** | Card primitive API, grid engine, tier enum, density enum |
| **Systems 1–3 (platform)** | Runtime, queue, Focus Panel shell, geometry |

Configuration **must not** override: card anatomy, tier color language, maximum density limits, header required fields, or operational hierarchy ceilings.

---

## Implementation mapping

| System 5 section | Code anchor |
|------------------|-------------|
| Card grammar + tokens | `web/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec.ts` |
| Card shell | `web/components/admin/focusPanel/UniversalCard.tsx` |
| Card derivation | `web/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards.ts` |
| Card render + embeds | `web/components/admin/focusPanel/FocusPanelCardRenderer.tsx` |
| Presentation CSS | `web/app/adminV2/components/alloyOsRuntime.css` (Focus Panel / ucard sections only) |
| Header | `web/components/admin/focusPanel/FocusPanelCompactHeader.tsx` |

**Out of scope for System 5 implementation:** split geometry, queue, workspace shell, runtime activation, BOS rail.

---

## Revision history

| Rev | Date | Change |
|-----|------|--------|
| 2 | June 2026 | **Implementation freeze** — Subject Identity Block, registry Manage, operational header |
| 1 | June 2026 | Initial canonical freeze — philosophy through configuration boundary |

---

## Implementation freeze (June 2026)

The Focus Panel operational surface is **approved**. Further work is configuration and interaction depth (5B/5C), not visual redesign.

**Frozen implementation:**

- Operational Mode default stack (condensed queue → subject → Focus Panel → BOS)
- Subject Identity Block header (pine rail, icon tile, context chips, Mission, BOS + Manage)
- System 5 card grammar, tiers, and archetype rendering (5A)
- Read-only status chip — protected by operational action pipeline
- Manage menu = `displayVm.actions.header_menu` (same registry catalog as command rail)
- No header stage-movement CTA; no unrestricted status mutation

**Documented, not fully built:** System 5B card interaction/expansion; System 5C content templates.

**Dormant:** Browse Mode; full-width expanded queue as default entry.

---

## Success criteria

When System 5 is authoritative:

- No engineer invents card spacing, color, or hierarchy ad hoc  
- Every Focus Panel card traces to tier + grammar + mode composition in this doc  
- Summary feels like an executive briefing; Work like a checklist; Activity like history  
- Embedded workspaces reuse existing components  
- Configuration adjusts composition; System 5 owns appearance
