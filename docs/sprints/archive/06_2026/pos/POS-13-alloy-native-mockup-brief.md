# POS-13 — Alloy-Native Mockup Brief (replacement)

> **Status:** Planning artifact — replacement visual brief for the three decisive POS screens. Draft.
> **Not product, not architecture.** No new concepts, no doctrine/object/workflow/navigation change. Visual language only.
> **Supersedes**, for these three screens only, the corresponding briefs in **POS-07** and prompts in **POS-09**. Grounded in actual Alloy doctrine (`bos-identity-doctrine.md`, `action-workspace-foundation.md`, `work-unit-layout-doctrine.md`, `queue-record-doctrine.md`, `typography-and-presentation-doctrine.md`, `settings-v2-doctrine.md`, `drawer-operating-model-v1.md`).
> Branch: `pos-planning-v1`.

## Purpose

Give designers and image tools everything needed to produce **Processing Workspace, Processing Case, and Outcome Configuration** concepts that an Alloy operator would immediately recognize as Alloy. Where POS-07/09 described an *Alloy-flavored* product, this brief specifies *Alloy itself* — the same Work Unit, Drawer, BOS, and Action Workspace primitives, reused.

Read **POS-12** first; this brief is the constructive half of that review.

---

## Alloy visual token reference (use these exact values)

**Color — restrained, from doctrine:**

| Role | Value / token | Use |
|------|---------------|-----|
| Midnight Forge shell | deep midnight/navy-charcoal (`alloy-midnight`) | Left nav + top bar + primary text |
| Canvas | **pure white** (`bg-white`) | Work surface; depth comes from panels, **not** gray/blue fill |
| Page field (workspace) | very light neutral stone, near-white | Behind white panels on workspace surfaces only |
| **Bend Pine** | **`#00A283`** (the Alloy mark color) / `alloy-juniper` | BOS identity, primary action affordances, selected/active, positive — **sparingly** |
| Soft emerald band | `from-emerald-50/70` → white gradient | Section panel header bands only |
| Neutral border | `alloy-stone` at ~12–15% (`rgba(39,63,82,0.12)`) | Panel/card borders, drawer rim |
| Muted slate | slate/midnight at ~55–65% | Secondary text, metadata icons |
| Amber | semantic amber | **Actual attention only** |
| Red | semantic red | **Severe/blocking only** |
| Blue | minimal | Track/selection highlight only — never CTAs |

**Forbidden:** loud green everywhere, generic enterprise/plugin blue buttons, **rainbow status systems**, decorative colored icon circles, heavy teal outlines, gray/blue page veils behind drawers.

**Typography — six tiers (`presentationTypography.ts`); values always win over labels:**

1. Record title — bold, midnight (~14px in queue, larger in drawer header)
2. Section header — semibold, with uppercase **eyebrow** above
3. Data value — **not muted**, medium weight, ≥90% midnight opacity
4. Label — smaller, lighter, **UPPERCASE**
5. Supporting — muted slate secondary context
6. Empty state — most muted; `—` placeholders are tier 6, never tier 3

Inter / DM Sans. No ad-hoc sizes, hex, or opacity. Sentence case in prose; uppercase only for tier-4 eyebrows/labels.

**Dates (`formatQueueRecordDateDisplay` / presentation date doctrine):** `Jun 14, 2020` · `Created Jun 11` · `May 20 · 2:30 PM` · relative `Today • 2:12 PM`. **Never** `MM/DD/YYYY` or ISO on operator surfaces.

**BOS identity (FROZEN — `bos-identity-doctrine.md`):**

- BOS = the **Alloy brandmark in Bend Pine** (`BosMark`). **Never** a dark rounded-square badge, a letter "B," a genie, a star/sparkle, or a generic AI glyph. **Never** spin or pulse the mark.
- Territory headers use the **`BosHeader`** lockup (mark + horizon + wave) + title + subtitle.
- Insights are **`BosNotification`** cards (finding + optional action link).
- Thinking = **smoke / working reveal** (a soft cloud condensing into the mark) while BOS analyzes/extracts/reviews — not streams, lanes, particles, or magic.
- Execution = **`BosExecutionLoader`** (numbered operational phases), distinct from identity smoke.

**Alloy section panel (the chrome POS keeps reusing — `DrawerOverviewPanelShell`):** white surface · **pine left accent** (`border-l alloy-juniper/70`) · soft shadow · header band with **soft emerald gradient**, **icon badge**, **UPPERCASE eyebrow**, semibold title. Centerpiece sections get stronger radius/shadow. Empty sections keep full chrome; empty body uses a dashed inner panel + tier-6 copy.

**Recurring sample content (verbatim):** Little Oaks Academy · operator Kelly Smith · The Smith Family — Sarah Smith (parent), Emma Smith (child, born Jun 14, 2020), case #4455667 · CCDF Subsidy Contract (State of Illinois), received via email 2m ago, BOS confidence 94% · other inflight: Johnson — Enrollment Packet, Garcia — Subsidy Contract, Miller — Registration Form.

---

## Screen 01 — Processing Workspace (as a Work Unit)

**Frame the screen as `WorkUnitWorkspace`, two zones only: Header → Queue, with the command rail at right.** It must answer "what requires my attention?" not "how many cases exist?"

**Composition**
- **Shell:** Midnight Forge left nav (POS pillar: Processing active; Review, Linkage, Forms, Packets, Documents, Settings) + dark top bar (search, breadcrumb, Work-with-BOS entry).
- **Header zone:** lifecycle/lane title "Processing"; a row of **lane/filter pills** (All · Needs review · Needs resolution · Ready · Completed) styled like work-unit lane pills; a **compact KPI/lane-context strip** where the counts live (small, in the header — never standalone SaaS tiles).
- **Queue zone (dominant, owns scroll, 6–7 rows):** each row is an **`OperationalQueueRecordRow`**:
  - Identity: **case title** (tier-1 bold midnight, e.g. "Smith Family — CCDF Contract") · primary family · muted source detail.
  - Related: linked child (Emma Smith) as a linked field with a **muted pine icon at rest**.
  - Status/context: a single status (pill/badge per layout) — neutral by default; **amber only for real attention**.
  - Attention/next-step: short reason ("Missing case number") with amber icon only when meaningful.
  - Date: compact (`Received 2m ago`, `Tour Jun 22`).
  - **Fixed action rail (right):** **Work with BOS** (Bend Pine) + Actions menu.
  - Icons are **neutral metadata glyphs** — one quiet source-type icon; **no colored circles, no per-channel colors**.
- **Command rail (right, fixed order):** collapsed **Actions (N)** single-row module → collapsed **Workflow Telemetry (n)** single-row module → **sticky BOS dock** at the bottom: `BosHeader` ("BOS") + `BosNotification` recommendation cards ("Approve Smith Family — Subsidy contract," "Resolve Garcia linkage") + "View all." BOS never shrinks; it stays fixed while the queue scrolls.

**Hierarchy:** queue dominates; header orients; rail assists. Selected row uses a subtle pine/stone selection wash (not a flooded green row).

**States:** empty = "No active processing" in tier-6 with full queue chrome retained; attention = amber row icon + reason; ingestion error = a restrained header notice, never a red wall.

**Do / Avoid:** Do reuse the exact work-unit queue row and command rail. Avoid: counter tiles, colored glyphs, rainbow statuses, a BOS-only rail, a boxed BOS badge, anything below the queue.

**GPT Image prompt**
> Alloy "Processing" work-unit workspace, exactly in the Alloy AdminV2 style. Midnight Forge dark left nav (POS section active) and dark top bar; pure white work surface. Two zones only: a slim header (lifecycle title "Processing", lane filter pills, a compact inline KPI strip — not dashboard tiles) above a dominant operational queue of 6–7 horizontal "processing case" rows. Each row: bold midnight case title ("Smith Family — CCDF Contract"), a muted neutral source icon (no colored circles), a linked child name with a muted pine icon, a single restrained status (neutral, amber only for real attention), a compact date ("Received 2m ago"), and a fixed right action cluster "Work with BOS" (emerald Bend Pine) + Actions. Right command rail, top to bottom: collapsed "Actions (6)" row, collapsed "Workflow Telemetry (4)" row, then a sticky BOS dock with the Alloy brandmark in emerald (not a letter badge, not a robot, not a star), a "BOS" header, and two recommendation cards with action links. Restrained Alloy palette: midnight text, emerald Bend Pine accents only on BOS and actions, stone borders, white panels. No charts, no blue buttons, no rainbow statuses, no decorative icons. 1440px desktop. --reference Alloy Work Unit workspace

**Midjourney prompt**
> Alloy AdminV2 work-unit workspace UI, "Processing" queue, dark midnight forge left nav and top bar, pure white canvas, dominant horizontal operational queue rows with bold midnight titles and neutral metadata icons, a fixed right command rail with collapsed Actions and Telemetry rows above a sticky BOS dock showing an emerald Alloy brandmark and recommendation cards, restrained emerald-and-stone palette, no charts, no blue, no rainbow status, premium operational software, 1440px --ar 16:9 --v 6 --style raw

**Figma recreation notes**
> Reuse `WorkUnitWorkspace` + `WorkspaceShellLayout`. Header = lane pills + compact KPI strip (no tiles). Queue = `OperationalQueueRecordRow` instances via the shared renderer; status via `QueueRecordFieldRenderer` display modes; neutral icon tokens (`--ws-wu-queue-icon-muted-color`); fixed `QueueRowActionRail` (Work with BOS + Actions). Command rail = `WorkspaceCommandRailShell` with collapsed Actions, `AutomationWorkflowsBlock presentation="work_unit_rail"`, then sticky BOS host using `BosHeader` + `BosNotification`. Bend Pine = `#00A283` only on BOS/actions/selected.

---

## Screen 02 — Processing Case (as a Drawer + Action Workspace)

**Frame the screen so opening a Processing Case feels like opening a Work Unit record (Drawer) and stepping into an Action Workspace.** Hierarchy is fixed: **Processing Case → Proposed Outcome → Supporting Evidence.** The document supports the case; it never co-headlines.

**Composition**
- **Header:** tier-1 record title "Smith Family — CCDF Contract"; a **status control** (Alloy status menu style, white, rounded-xl, juniper-tint selected) reading "Needs review"; supporting line "Received 2m ago · Case #4455667". A **step rail** (Gather → Review → Execute → Continue) sits in the header — BOS has already *gathered* from the source, so the case opens on **Review**.
- **Canvas (pure white, depth from section panels — `DrawerOverviewPanelShell` chrome throughout):**
  1. **Proposed Outcome — centerpiece panel** (stronger radius/shadow; pine left accent; emerald header band; icon badge; eyebrow "PROPOSED OUTCOME"). A calm ordered list — Create subsidy profile · Create billing setup · Link to Emma Smith · Start reimbursement workflow · Send confirmation — each a tier-3 value with a tier-4 trigger label. A quiet impact line: "Creates 2 records · starts 1 workflow · sends 1 email." This panel is the visual hero of the body.
  2. **Extracted information — BOS suggestions review** (panel, eyebrow "EXTRACTED INFORMATION"). Values as **BOS suggestions**: tier-3 value + tier-4 uppercase label + a small confidence affordance and inline edit; the weak field (Case number, lower confidence) is highlighted for confirmation; an **Apply** affordance promotes suggestions. Dates render `Jun 14, 2020`.
  3. **Supporting evidence** (panel, eyebrow "SOURCE"). A compact representation of the CCDF contract with an **"Open document" affordance that opens the source in a Drawer** — not an inline PDF viewer competing for the canvas.
  4. **Linked records** + **Activity** as standard right-of-grid panels (avatars, four-line read hierarchy where relevant), Empty ≠ disabled.
- **BOS rail (sticky dock):** `BosHeader` "BOS"; confidence as a **tier value** ("94% · high"), not a boxed score; likely matches (Family → The Smith Family · 95%; Child → Emma Smith) as `BosNotification` lines; recommended actions; **Approve all** (Bend Pine) as the **Execute** affordance, with **Review manually** and **Reject** secondary. On a high-confidence, no-edit case, show the **fast path** (Approve all is primary and immediate).
- **Execute → Success:** approving runs a visible **`BosExecutionLoader`** (numbered phases matching the outcome steps); on Success (~1.4s) the screen hands off to the **created record Drawer** (subsidy/billing), exactly like Create Lead's `onCreated`.

**Hierarchy:** Case title → Proposed Outcome (centerpiece) → Extracted suggestions → Supporting evidence. The eye lands on what will happen and the approve action, then the evidence behind it.

**States:** low confidence = case opens on Review with flagged suggestions, fast path suppressed; conflict = a paired "suggested vs current" value inside the extracted panel with a confirm affordance, case in "Needs resolution"; ready = suggestions applied, outcome validated, Approve all primary; executing = `BosExecutionLoader` phases; complete = success → open created record drawer.

**Do / Avoid:** Do reuse drawer panel chrome, the status menu, the Action Workspace flow, and the `onCreated` drawer handoff. Avoid: an inline PDF viewer as a co-equal column, generic white cards, a boxed BOS badge, MM/DD/YYYY dates, document-first hierarchy.

**GPT Image prompt**
> Alloy AdminV2 record screen for a "Processing Case", styled exactly like an Alloy Lead drawer plus an Action Workspace. Midnight Forge dark left nav; pure white canvas with depth from section panels (each panel has a pine/emerald left accent, a soft emerald-tinted header band, an icon badge, an UPPERCASE eyebrow, and a semibold title). Header: large record title "Smith Family — CCDF Contract", an Alloy status menu reading "Needs review", supporting line "Received 2m ago · Case #4455667", and a step rail "Gather · Review · Execute · Continue" with Review active. Body hierarchy, top to bottom: (1) a CENTERPIECE "PROPOSED OUTCOME" panel — an ordered list: Create subsidy profile, Create billing setup, Link to Emma Smith, Start reimbursement workflow, Send confirmation, with a quiet impact line; (2) an "EXTRACTED INFORMATION" panel showing values as BOS suggestions with small confidence chips and inline edit, dates like "Jun 14, 2020", one low-confidence field flagged; (3) a "SOURCE" panel showing the contract compactly with an "Open document" link (no big inline PDF). Right sticky BOS dock: the emerald Alloy brandmark (not a letter, not a robot), a "BOS" header, "94% · high" as plain text, likely matches as notification lines, and a primary emerald "Approve all" button with secondary "Review manually" and "Reject". Restrained emerald-stone-midnight palette, tiered typography (values darker than uppercase labels), no blue buttons, no rainbow, no boxed AI badge. 1440px desktop. --reference Alloy drawer + Action Workspace

**Midjourney prompt**
> Alloy AdminV2 "Processing Case" record screen, like an Alloy lead drawer plus action workspace, dark midnight left nav, pure white canvas, white section panels each with an emerald-pine left accent and a soft emerald header band with uppercase eyebrow, a centerpiece "Proposed Outcome" ordered list panel as the hero, an "Extracted information" panel with BOS suggestion values and small confidence chips, a compact "Source" panel with an open-document link, a sticky right BOS dock with an emerald Alloy brandmark and a primary emerald "Approve all" button, restrained emerald-stone-midnight palette, tiered typography, no blue, no rainbow, premium operational software, 1440px --ar 16:9 --v 6 --style raw

**Figma recreation notes**
> Compose with `DrawerOverviewPanelShell` for every section (pine left accent, emerald header band, icon badge, eyebrow). Proposed Outcome = centerpiece variant (stronger radius/shadow). Extracted = Action Workspace `ActionWorkspaceBosSuggestions` pattern (confidence + inline edit + Apply). Header status = `VmDrawerHeaderStatusSelect` style. Step rail = `ActionWorkspaceStepRail`. Approve all = Execute → `ActionWorkspaceExecuteState` / `BosExecutionLoader` → `ActionWorkspaceSuccessState` → `onCreated` drawer open. BOS dock = `BosHeader` + `BosNotification`. Typography via `presentationTypography` tiers; dates via `presentationDateFormat`. Bend Pine `#00A283` only on Approve/selected/BOS.

---

## Screen 07 — Outcome Configuration (as Settings V2 / Business Processes)

**Frame the screen as an Alloy Settings V2 configuration surface (the Business Processes reference), not a workflow builder.** It configures "what a subsidy contract should do when approved" the way an operator configures a business process.

**Composition**
- **Shell + context:** Midnight Forge nav with Settings active; Settings V2 breadcrumb (Operations → Outcomes → Subsidy contract). **White canvas, premium spacing, card-based hierarchy.**
- **Header:** "Subsidy contract — outcomes"; supporting line; a single **Active** state and one **Save outcome** action (soft-green confirmation on save) — **no per-section/per-row Save**.
- **Body — one pine-accent section panel** (`DrawerOverviewPanelShell` chrome; eyebrow "WHEN APPROVED"): the recipe as a calm **configured list** — Create subsidy profile · Create billing setup · Link to child · Start reimbursement workflow · Send confirmation. Each row: tier-3 step value · a **neutral text category** ("Record", "Workflow", "Communication" — no colored tags) · a quiet trigger ("When approved"). Order is read top-to-bottom; reordering is a subtle handle, not a builder canvas. Auto-execute (if shown) is **one subordinate setting**, consistent with the open V1 decision (POS-11).
- **Right:** a compact **Outcome details** panel (Trigger, Applies to, Auto execute) + **Estimated impact** (Creates 2 records · starts 1 workflow · sends 1 email), and a BOS validity `BosNotification` ("This outcome looks good" — required steps, logical order, mappings valid).
- **Parity:** the configured list must visually match the Processing Case's Proposed Outcome panel one-to-one.

**Hierarchy:** the recipe (what will happen) leads; details/impact/BOS support. Minimal blue only for selection/track; soft green only for the saved state.

**States:** empty = "No outcome configured — start from a recommended recipe" (offer the Enrollment Form recipe) with full panel chrome; saved = soft-green confirmation; invalid = amber inline on the offending step, Save guarded.

**Do / Avoid:** Do reuse Business Processes stage-config chrome and one-Save pattern. Avoid: numbered builder cards with per-row toggles, colored category tags, flowchart/connector visuals, generic enterprise blue, a boxed BOS badge.

**GPT Image prompt**
> Alloy AdminV2 Settings screen "Subsidy contract — outcomes", styled exactly like the Alloy Business Processes (Settings V2) configuration surface. Midnight Forge dark left nav with Settings active; pure white canvas, premium spacing. Header: title, an "Active" state, and a single "Save outcome" button (no repeated save buttons). One white section panel with a pine/emerald left accent and a soft emerald header band, uppercase eyebrow "WHEN APPROVED", containing a calm ordered configuration list: Create subsidy profile, Create billing setup, Link to child, Start reimbursement workflow, Send confirmation — each row showing the step as a medium-weight value, a NEUTRAL TEXT category ("Record", "Workflow", "Communication" — no colored tags), and a quiet "When approved" trigger. Right side: a compact "Outcome details" panel and an "Estimated impact" line (creates 2 records, starts 1 workflow, sends 1 email), plus a BOS validity card with the emerald Alloy brandmark (not a letter badge). Restrained palette: midnight text, emerald accents only on the active state and save, stone borders, minimal blue only for selection, soft green only for the saved state. No flowchart, no connector lines, no per-step toggles panel, no colored category chips, no blue CTAs. 1440px desktop. --reference Alloy Settings V2 Business Processes

**Midjourney prompt**
> Alloy AdminV2 Settings V2 configuration screen, "outcome" recipe like Business Processes stage config, dark midnight left nav, pure white canvas, one white section panel with emerald-pine left accent and soft emerald header band, a calm ordered configuration list of outcome steps with neutral text categories (no colored tags), a single Save action, a compact details and estimated-impact panel, a BOS validity card with an emerald Alloy brandmark, restrained emerald-stone-midnight palette, no flowchart, no connectors, no blue buttons, premium operational settings UI, 1440px --ar 16:9 --v 6 --style raw

**Figma recreation notes**
> Reuse the Business Processes stage-config layout (`/admin/settings/lifecycle` reference). Section = `DrawerOverviewPanelShell` (pine accent, emerald band, eyebrow). Recipe rows = configured list items (value + neutral category text + trigger), subtle reorder handle, **no per-row toggle cluster**; one `Save outcome` (soft-green confirm). Details/impact = compact side panels. BOS = `BosNotification`. Category is text/eyebrow only — no color. Mirror the Processing Case Proposed Outcome component exactly. Bend Pine `#00A283` only on Active/Save/BOS.

---

## Success test

A reviewer placing these three concepts beside a real Alloy Work Unit, Drawer, and Settings V2 screen should say **"this is another Alloy workspace,"** not "this is a new product." Concretely, that means: the BOS mark is the real emerald brandmark in `BosHeader`/`BosNotification`; the queue is a real work-unit queue with a fixed Actions→Telemetry→BOS rail; the Processing Case is a white-canvas drawer with pine-accent emerald-band panels whose hero is the Proposed Outcome and whose approve flow is the Action Workspace Execute → `onCreated` handoff; and Outcome Configuration is Settings V2 with one Save and no rainbow. With this brief applied, POS is ready for the **Architecture Gate**.
