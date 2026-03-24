# Admin V2 Workspace System — Shared Architecture (v1)

Internal reference: **one workspace pattern** across **Company → Department → Work Unit → Record**. This doc defines **roles** and **column contracts** so industry variants stay aligned. It is **not** a full visual redesign spec.

**Related:** [Department UI system](./DEPARTMENT_UI_SYSTEM_V1.md) — deeper detail for the department surface; **must stay consistent** with the column rules below.

---

## 1. Purpose

- **Stop screen-by-screen drift** — same mental model at every scope.
- **Make industry demos cheap** — swap data and lane content, not architecture.
- **Separate understanding from execution** — operators know where to read state vs where to act.

---

## 2. Universal column contract

Fixed **~75% primary (left) / ~25% command (right)** split is shared. Ambient shell, global chrome, and page split are **out of scope** for this document.

### Left column — context / state / connected reality

**Role:** Help the user **understand the object at this scope** — what it is, how it’s doing, what it’s connected to, what happened recently.

Typical bands (top → bottom):

| Band | Purpose |
|------|--------|
| **Header / focus** | Scope label, headline, optional briefing hook, AI awareness |
| **Signals** | Actionable exceptions and opportunities |
| **Metrics** | KPIs / measurement strip appropriate to altitude |
| **Main contextual content** | The “thing” at this level: rollups, queues, record body, org tiles, etc. |
| **Entity / relationship context** | **Record only (today):** related entities + customer/contact in the body **aside** via `contextRail` + `ContextBlock` `layout="embedded"`. **Company / Department / Work Unit:** no standalone relationship block in the shell — **deferred** (forcing a large block competed with the work surface). |
| **Workflow / automation strip** | How automation touches this scope (when present) |

**Principle:** understanding vs execution is still **left vs right**; relationship *panels* at org/dept/lane altitude need a **lighter pattern** later (inline, drill, or density), not a second “hero” block under the queue.

### Right column — decisions / actions

**Role:** **Act on the current scope** — status, next step, and **executable** controls.

Target structure (top → bottom):

1. **Status / decision anchor** (when relevant) — concise system/record state, not long narrative.
2. **Primary actions** — 1–2 solid primary buttons (cap enforced in UI).
3. **Recommended / operational actions** — user-typed next steps (often row-style, grouped in one card).
4. **AI suggestions** — system-recommended actions, visually lighter than operational rows, same rail.
5. **More actions** — lower-priority or rare actions, **collapsed** by default.

**Not in the command rail:**

- No generic **“Context & support”** bucket.
- No relationship lists whose primary job is **understanding** rather than **immediate execution**.

If information supports a decision but isn’t itself an action, it should appear on the **left**, attached to real entities or sections.

---

## 3. Scope mapping (same contract, different content)

| Workspace level | Primary column (understand) | Command rail (act) |
|-----------------|---------------------------|---------------------|
| **Company** | Org focus, signals, KPIs, **department rollup cards**, workflows — **no** `ContextBlock` in column or rail | **Actions only** |
| **Department** | Today’s focus, signals, KPIs, throughput / attention **queues**, workflows — **no** `ContextBlock` in column or rail | **Actions only** |
| **Work Unit** | Lane focus, signals, KPIs, **primary queue**, workflows — **no** `ContextBlock` in column or rail | **Actions only** |
| **Record** | Control deck → **body** (core facts) + **aside**: Customer/contact + **embedded related entities**; recent activity **above workflows** | **Actions only** |

**Record template constraint:** Aside stays **Customer / contact** + **Related entities** only (no extra blocks such as site contacts in the record slice — trim config/data per level).

---

## 4. Implementation (this repo)

| Surface | Relationship / context UI | Command rail |
|---------|---------------------------|--------------|
| **Record** | `ContextBlock` `layout="embedded"` in body **aside** (related entities); `RecordInteractionPanels` = customer/contact only; no site-contacts group on record in cleaning demo config | `ActionsBlock` only · `aria-label="Decisions and actions"` |
| **Company** | `contextRail` on model **not rendered** in shell (intentional deferral); adapters may still populate | `ActionsBlock` only |
| **Department** | Same — **not rendered** | `ActionsBlock` only |
| **Work Unit** | Same — **not rendered** | `ActionsBlock` only |

Shared pieces:

- `ContextBlock.tsx` — `layout="embedded"` with **`--record-aside`** for Record; **`--primary`** + title classes exist for reuse but **workspace shells** do not mount them on company/dept/wu.
- Legacy `layout="rail"` + “Context & support” remains in `ContextBlock` for non-shell use only; **no workspace shell** mounts context in the command column.

---

## 5. File pointers

| Shell | Path |
|-------|------|
| Record | `web/app/adminV2/components/workspace/shells/RecordWorkspace.tsx` |
| Company | `.../CompanyWorkspace.tsx` |
| Department | `.../DepartmentWorkspace.tsx` |
| Work Unit | `.../WorkUnitWorkspace.tsx` |
| Context | `.../blocks/ContextBlock.tsx` |
| Actions | `.../blocks/ActionsBlock.tsx` |
| Cleaning context config (level visibility) | `web/lib/ui-v2/demo/context-demo-config.ts` |

---

## 6. Weak spots / follow-ups

1. **Cross-level relationships** — when we reintroduce org/dept/lane relationship data, prefer **non-competing** patterns: row-level in queues, tooltips, drill modals, compact inspector chips, or a **collapsible** strip — not a large block under the main work surface.
2. **`contextRail` on company/dept/wu** — still on the type + adapters for future wiring; document when a consumption path exists.
3. **`recordRelatedContext` vs `contextRail`** — prefer normalizing into `contextRail` for Record so the aside does not duplicate “related” concepts.

---

## 7. Change control

- **Do not** use this doc to justify changing ambient shell, global nav, or 75/25 split without an explicit initiative.
- **Do** use it when adding a new workspace level or industry demo to decide **where a new block lives** (left vs right).
