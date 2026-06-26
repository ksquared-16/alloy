# Alloy OS — Workspace V3 — Operational Surface Doctrine

**Revision:** 1  
**Status:** Canonical platform doctrine (June 2026)  
**Authority:** Launcher law for Zone 3 of `/workspace` — how operational domains invite operators into execution.

**Parent:** [`workspace-v3-command-center-doctrine.md`](./workspace-v3-command-center-doctrine.md)  
**Evolution constraint:** [`sprint-3-evolution-reset.md`](../../sprints/06_2026/workspace-v3-operational-command-center/sprint-3-evolution-reset.md) — tile **shell** frozen; inner content evolves  
**Not to be confused with:** [`operational-surface-design-system.md`](./operational-surface-design-system.md) (System 5 — Work Unit surfaces)

---

## 1. Definition

An **Operational Surface** is a **miniature representation of a complete operational domain** on the Workspace landing page.

Operational Surfaces are **not cards** in the dashboard sense. They are **launch environments** — compressed previews of what the operator will find inside a Business Process's Work Unit(s).

| Term | Meaning |
|------|---------|
| **Business Process** | Platform noun — catalog identity (Enrollment, Billing, …) |
| **Operational Surface** | Workspace presentation of that process — storytelling + entry points |
| **Work Unit** | Runtime execution surface — where work happens |
| **Work View** | Predefined filtered entry into a Work Unit |

**Law:** The purpose of an Operational Surface is **not to summarize metrics**. The purpose is **to invite operators into execution**.

---

## 2. Operational storytelling

Traditional dashboards display numbers. Operational systems communicate **priorities**.

### Dashboard pattern (prohibited as primary communication)

```
Enrollment
7 Active Leads
3 Tours
2 Waitlist
```

### Operational storytelling pattern (required)

```
Enrollment                                    Healthy
3 families are waiting for contact.

Today's work
• 2 Tours
• 1 Enrollment
• 3 Follow Ups

Open Enrollment →
```

| Layer | Role |
|-------|------|
| **Story** | Meaning-first — what deserves attention, in plain language |
| **Numbers** | Support the story — counts anchor the narrative, never lead it |
| **Today's work** | Actionable cohort lines — each potentially enterable |
| **Open →** | Default entry into the complete Work Unit |

**Law:** Numbers support the story. The story is the primary communication.

Copy rules:

- Lead with **health** or **attention state** when meaningful  
- Use **human cohort language** ("3 families are waiting for contact") not schema labels  
- Group work under **time or action framing** ("Today's work", "Requires action")  
- Max **3–5 enterable lines** per surface — scannable, not exhaustive  

---

## 3. Surface anatomy (required elements)

Scan order:

1. **Domain identity** — icon well + process name  
2. **Health / status** — Healthy · At Risk · Needs Attention · Blocked  
3. **Operational story** — one sentence, meaning-first priority narrative  
4. **Today's work** (or domain-equivalent section label) — bulleted enterable lines  
5. **Primary launch** — `Open {Process} →` — Level 1 entry  

Optional (secondary scan):

- Quiet workload footer (records in flight, stages active) — never competes with story  
- Domain left-rail accent (System 5 token)  

### Prohibited

- Metric grids without narrative framing  
- Raw queue keys or work view IDs in operator copy  
- Sparklines, trend deltas, period comparisons  
- Inline queue rows or record lists  
- More than one primary launch affordance competing visually  

---

## 4. Three navigation levels (entry doctrine)

Every Operational Surface supports **multiple entry points**. Every meaningful operational number should usually be **enterable**.

### Level 1 — Process launch (default)

**Affordance:** `Open Enrollment →`  
**Destination:** Default Work Unit entry — Operational Mode, Default Operational Subject resolution  
**Route pattern:**

```
/workspace/work-unit/{slug}
```

Uses existing `entryHref` from lifecycle catalog. No additional filtering.

### Level 2 — Work View deep links (required architecture)

**Affordance:** Clickable line in Today's work or story-adjacent summary  
**Destination:** Work Unit with **predefined Work View** active — queue/filter already applied  
**Route pattern:**

```
/workspace/work-unit/{slug}?work_view={workViewId}
```

Optional compat params (existing runtime):

| Param | When |
|-------|------|
| `queue` | Legacy lane key when Work View maps to queue |
| `work_view` | Preferred — Configuration Runtime Work View id |
| `attention_bucket` | Needs Attention bucket lens |
| `queue_layout` / `focus_layout` | When Work View specifies layout assignment |

**Law:** Deep links must open the Work View **without requiring additional operator filtering**. The operator lands in work immediately.

**Examples:**

| Line item | Work View | Resolved destination |
|-----------|-----------|----------------------|
| 2 Tours | `tours_today` | Enrollment WU → Tours Today view |
| 3 Follow Ups | `follow_ups` | Enrollment WU → Follow Ups queue |
| $14,200 Outstanding | `outstanding` | Billing WU → Outstanding view |
| 4 Staffing Conflicts | `conflicts` | Scheduling WU → Conflicts view |

Implementation bridge: `buildOperationalViewPreviewRuntimeHref`, `resolveWorkUnitQueueKeyFromLocation`, `readWorkUnitQueueLocationParams` — see sprint-2 routing doc.

### Level 3 — BOS insight launch (future, design now)

**Affordance:** Narrative insight generated by BOS  
**Destination:** Filtered queue + relevant Focus Panel subject  
**Route pattern (contract):**

```
/workspace/work-unit/{slug}?work_view={workViewId}&bos_insight={insightId}
```

Level 3 destinations may not exist for all tenants yet. **Routing contract must be designed now** so Level 1–2 links do not require rework.

---

## 5. Enterability law

> **If an operator can see an operational number, they should usually be able to enter that work directly.**

| Visible signal | Enterable? | Level |
|----------------|------------|-------|
| Today's work line with count | ✅ Yes | 2 |
| Operational Pulse indicator (cross-process) | ✅ When mapped | 2 |
| Story narrative without count | ❌ Orient only | — |
| Health chip | ❌ Status only | — |
| Footer workload totals | ⚠️ Optional L1 only | 1 |
| Analytics trend | ❌ Never on Workspace | — |

Non-enterable numbers require explicit doctrine exception (e.g. org-wide health with no single Work View owner).

---

## 6. Work Views — exposure strategy

Operational Surfaces **do not invent queue functionality**. They **expose existing Work Views** configured on the Business Process.

Work Views are **filtered entry points** into the frozen runtime — not new queue types.

### Reference Work View catalog (by domain)

| Domain | Work Views (examples) |
|--------|----------------------|
| **Enrollment** | Default · Today's Tours · Waiting Families · Follow Ups · Ready to Enroll · Needs Attention |
| **Billing** | Outstanding · Collections · Failed Payments · Invoices Ready |
| **Scheduling** | Room Changes · Conflicts · Coverage |
| **Attendance** | Missing Check-ins · Late Pickups · Capacity Issues |
| **Compliance** | Licensing Items · Expiring Documents · Overdue Filings |
| **Staffing** | Open Shifts · Coverage Gaps · Time-off Pending |
| **Health** | Expiring Immunizations · Allergy Updates · Records Needing Review |

Tenant configuration determines which Work Views exist and which appear on each Operational Surface. Platform owns **anatomy and routing**; configuration owns **membership and ordering**.

---

## 7. Visual grammar

Operational Surfaces inherit **System 5** tokens and **today's `processNavTile` shell**:

- **Frozen shell:** `WS_LAYOUT.processNavTile` — juniper left rail, rounded-xl, white bg, shadow, min-h 10rem, Open → footer  
- **Evolved interior:** story sentence + Today's Work list replaces metric label/value rows  
- Story text: 13–14px, meaning-first  
- Today's work lines: compact list with juniper link affordance on counts  
- `Open →`: existing juniper ghost button — unchanged  

**Law:** Do not replace tile chrome with a new card primitive. Evolve content inside existing Alloy tiles.

---

## 8. Relationship to frozen runtime

| System | Relationship |
|--------|--------------|
| Work Units | Entry target — unchanged |
| Queue | Not rendered on Workspace; reached via Work View deep link |
| Focus Panel | Not rendered on Workspace; opens on WU entry per Operational Mode |
| Universal Cards | Grammar inherited for typography and accent — not rendered on Workspace |
| BOS | Level 3 insights only; command rail unchanged |
| System 5 | Visual tokens only |

---

## 9. Workspace ↔ Work Unit continuity (cover page)

The Operational Surface is the **visual and informational cover page** of the Work Unit — not a separate product surface.

| Work Unit element | Operational Surface preview |
|-------------------|----------------------------|
| `adminv2-os-context__title` (ENROLLMENT) | Same typography inside tile |
| `adminv2-os-context__kpi-strip` | Same inline KPI row (cover density) |
| Perspective pills | Today's Work lines (Work View labels) |
| `CompressedQueueHeader` | Story sentence + highest-priority insight |
| Queue rows | Not on Workspace — **revealed on entry below context bar** |

**Law:** Opening a Work Unit should **expand** the cover stack and **reveal the queue below** the operational-surface top — same pine rail, same title row, same shell. Sidebar, header, and BOS rail do not remount.

Full audit: [`sprint-4-ux-continuity.md`](../../sprints/06_2026/workspace-v3-operational-command-center/sprint-4-ux-continuity.md)

---

## 10. Configuration (design for — not implement)

See [`sprint-2-evolution.md` § Configuration architecture](../../sprints/06_2026/workspace-v3-operational-command-center/sprint-2-evolution.md).

Operational Surfaces will become configurable. Platform must reserve:

- Surface ordering  
- Work View assignment per story line  
- Summary row templates (story + today's work slots)  
- Process visibility per org  
- Role-based surface sets  
- Preview metric bindings (OIP placements)  

---

## 11. Success criteria

- [ ] Operators read **priority stories**, not metric tables  
- [ ] Every Today's work line with a count is **clickable** when a Work View exists  
- [ ] `Open →` remains the **obvious default** into full process context  
- [ ] Transition into Work Unit feels like **zooming in**, not navigating away  
- [ ] Same anatomy works for Enrollment, Billing, Scheduling, Attendance, Compliance, Staffing, Health **without domain-specific layout branches**
