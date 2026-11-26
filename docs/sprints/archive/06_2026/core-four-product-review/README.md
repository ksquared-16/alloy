# Alloy OS — Core Four Product Review

Sprint: **Alloy OS — Core Four Product Review** · June 2026  
Status: **Product design review** (architecture frozen; no new primitives)

**Verdict: One final refinement pass** — then ready for production validation and Experience Builder integration.

Screenshots and runtime context: [`../focus-panel-composition-review/`](../focus-panel-composition-review/)

---

## Executive summary

The Core Four are **architecturally correct** — each card consumes `OperationalContext`, ownership boundaries are mostly respected in evidence builders, and perspective depth (Overview → Evidence → Focused) works locally without fetches.

They do **not yet read as one continuous operating system**. The operator still sees four independent widgets because:

1. **Visual language is inconsistent** — field-form KV grids (`<b>Program</b> value`) fight the “answer first, evidence second” card language.
2. **Readiness does not point** — factor clicks stay inside Readiness; the diagnosis → owner → edit path is not wired.
3. **The shell announces itself** — header band, mode tabs, per-card footers, and identical stacked chrome prevent the panel from disappearing.
4. **Content duplication** — insight lines repeat what the collapsed body already shows (primary contact, primary work item).
5. **Blocked Readiness bleeds task language** — attention signals like “Review Lead overdue” read as Current Work, not readiness diagnosis.

None of these require new architecture. They are polish items on frozen contracts.

---

## 1. Information ownership

### What is correct today

| Truth | Owner | References (read-only) | Status |
|-------|-------|------------------------|--------|
| **Program / schedule / start / room** | Children | Readiness (via `buildChildrenCardEvidence`) | ✅ Correct |
| **Emergency / pickup / billing contacts** | Household | Readiness (primary contact factor only) | ✅ Correct |
| **Child names / belonging count** | Household (names only) | Children (full operational truth) | ✅ Correct |
| **Open tasks / stage work** | Current Work (`context.signals.work`) | Readiness (attention blocker factor) | ✅ Correct |
| **Attention / blocker reasons** | Platform signal → Readiness cites | Current Work may share label | ⚠️ See below |

Evidence builders enforce this:

- `buildHouseholdCardEvidence` — children are **belonging-only** (name, no program/schedule).
- `buildChildrenCardEvidence` — owns `_inquiry_children` operational fields.
- `buildReadinessCardEvidence` — **derives** from children evidence + attention; never writes.
- `buildCurrentWorkCardEvidence` — owns `context.signals.work` only.

### Gaps to fix

| Issue | Where | Recommendation |
|-------|-------|----------------|
| **Readiness “Program selected” owns no edit path to Children** | `ReadinessCard` `FactorRow` | Factor click should **point** to Children → focused child → program field — not expand Readiness locally. Readiness never edits. |
| **Attention factor duplicates Current Work headline** | `buildReadinessCardEvidence` when `attention.primaryReason` is a task title | Split **task urgency** (Current Work) from **readiness blockers** (documents, immunizations, missing info). When the signal is stage-work text, Readiness should say “Stage work incomplete” and defer the task name to Current Work. |
| **Household shows primary contact twice** | `UniversalCard` insight + `CollapsedBody` `ContactLine` | Insight = answer; body = evidence **or** insight only — not both with the same fact. |
| **Children collapsed row shows program** | `ChildSummaryRow` | Acceptable as **preview** (Children owns program). Ensure Readiness never renders program values — only “N missing”. ✅ Already true. |

### Ownership rule (frozen)

> Every operational fact has exactly one **owner card** that may edit (future). Every other card **references** or **points**. Readiness is always a pointer, never an editor.

---

## 2. Card language & formatting

### Principle

Cards answer questions. They do not display fields.

**Order:** Answer → Evidence → Metadata

### Current violations

| Card | Example | Problem | Target copy pattern |
|------|---------|---------|---------------------|
| Household | Insight when contact name is bad data: *“Address: 123 main street is the primary contact”* | Record data + no sanitization | *“Sarah Johnson is the primary contact · 1 child”* — validate display names that look like address tokens |
| Children | `ChildKvGrid`: **DOB / age** · **Program** · **Schedule** | Field-form | *“Preschool · M–F · starts Jun 2026”* as one evidence sentence; labels only in Focused edit |
| Current Work | `FocusedWorkItem` kv: **Due** · **Source** · **Type** | Field-form | *“Review Lead — overdue 3 days (BOS Assist)”* |
| Readiness | Blocked insight: *“Review Lead overdue”* | Task language, not diagnosis | *“Blocked — program and schedule incomplete”* or cite the **blocker category**, not the task title |
| All four | Footer: *“View household →”* on every card | Widget chrome | Use **once** per card for depth; consider inline chevron on insight row instead of footer band |

### Recommended formatting pass

1. **Replace `alloy-os-card-kv` label/value grids** in Children and Current Work Focused views with **sentence evidence** (same data, natural language).
2. **Insight line is the answer** — body adds *new* evidence only. Remove duplicate primary contact / primary work row when insight already states it.
3. **Metadata last** — `Updated 2026-06-25`, “Prefers email”, count pills move to the quietest tier (smaller, muted, below evidence).
4. **Status chips** — keep one per card max; prefer embedding urgency in the answer (*“Review Lead — overdue”*) over a separate “Overdue” chip on both insight and chip.

---

## 3. Typography & visual density

### Current state

- Shared `UniversalCard` shell: title (caps), insight (bold), supporting (muted), body, footer.
- Core Four reuse `alloy-os-household__*` row primitives — good for cohesion, but everything reads at the same weight.
- Tier left-border accents (`alloy-os-ucard--tier-*`) add System 5 chrome.
- 14px grid gutter (recent pass) helps; per-card internal padding still dense.

### Recommendations

| Area | Change |
|------|--------|
| **Hierarchy** | Insight `font-size` +1 step vs body; supportingInsight smaller/lighter; title demote (11px muted caps → sentence case optional) |
| **Line height** | Body rows `line-height: 1.45`; insight `1.35` — reduce cramped 12.5px stacks |
| **Rhythm** | Single vertical rhythm unit (8px) between evidence rows; 12px before footer; **remove footer divider** when action is “expand depth” |
| **Labels** | Eliminate bold `<b>Label</b>` in evidence; use muted prefix only in Focused edit perspective |
| **Avatars / leads** | Consistent 24px circles; `!` / `✓` / `●` leads only in lists, not beside insight |
| **Calm** | Reduce border contrast on `.alloy-os-ucard`; one shadow level; whitespace between cards ≥ 16px in stack mode |

Compare target: approved Household mock (`docs/sprints/archive/06_2026/household-card-mock/`) — insight dominates, evidence is quiet, stats are pills not rows.

---

## 4. Household

**Question:** *Who belongs to this household, and who can I contact?*

### Working

- Evidence groups (primary, other parent, emergency, pickups, children names, address, billing) match the design freeze.
- Children group is belonging-only; click focuses names within Household (Perspective Change) — correct.
- Missing-state warnings (no primary, no emergency) surface appropriately.
- Address is a distinct group — correct.

### Refine

| Item | Recommendation |
|------|----------------|
| **Headline** | Keep natural-language `answerLine`; add guard when `primaryContact.name` matches address-field patterns |
| **Collapsed body** | Show **either** insight answer **or** primary contact row — not both |
| **Stats pills** | Good; reduce border weight; clicking Children pill should **not** imply Subject Change — keep belonging-only focus ✅ |
| **Parent presentation** | Role pill “Primary” is loud; move to trailing muted tag |
| **Address** | In collapsed overview, one muted line under primary contact — not only in expanded group |
| **Missing states** | Differentiate “No primary contact” (blocked) vs “No emergency contact” (warning) typographically |

---

## 5. Children

**Question:** *What is true about this child right now?*

### Working

- Owns program, room, schedule, start, status, DOB/age from `_inquiry_children`.
- Collapsed roster: name + dobAge + program + status pill — closest to approved mock.
- Readiness correctly counts missing program/schedule/start from this evidence.

### Refine

| Item | Recommendation |
|------|----------------|
| **Visual hierarchy** | Name bold; operational sentence second line; status pill trailing — not a third competing line |
| **Expanded / Focused** | Replace KV grid with: *“Preschool · North Room · M–F · starts Aug 2026”* |
| **Readiness relationship** | When Readiness points here (future), land on **Focused child** with program/scheduling evidence visible |
| **Empty** | “No children linked” → *“No children on this record — add a child to continue enrollment”* |
| **Flags** | `flags: []` always empty today — hide flag region until real signals exist |

---

## 6. Readiness

**Question:** *Is this family ready to advance?*

### Working

- Pure derivation; honest score = complete ÷ total factors.
- Factors reference owners correctly in **data** (program/schedule/start from Children evidence).
- Gauge + verdict vocabulary (Ready / Almost / Blocked) matches Intelligence archetype.

### Refine — diagnosis model

Readiness **never owns editing**. Every incomplete factor is a **pointer**.

| Factor | Pointer target (same Operational Context) |
|--------|-------------------------------------------|
| Primary contact | Household → primary contact group → edit |
| Children added | Children → add flow |
| Program selected | Children → focused child → program |
| Schedule selected | Children → focused child → schedule |
| Desired start | Children → focused child → start |
| Attention blocker | Owner depends on blocker type (Documents, Current Work, etc.) |

**Implementation (final refinement pass, not new architecture):**

- Add `ownerCard` + `ownerFocus` metadata to each `ReadinessFactor` in evidence builder.
- `FactorRow` click emits a **panel-level focus request** (scroll + expand target card + set perspective) — not a Subject Change, not a fetch.
- `FocusedFactor` copy: *“Program isn’t set for Jonny — open Children to set it.”* with explicit **Go to Children →** action.
- Remove local-only focus that traps the operator inside Readiness.

### Copy fixes

- Blocked insight should lead with **category** (*“3 enrollment essentials missing”*), not task title.
- “33% ready to advance” is good for Almost; for Blocked prefer *“Blocked — …”* without percentage front-loading.

---

## 7. Current Work

**Question:** *What should happen next?*

### Working

- Collapsed shows **one** primary item — not a task list ✅
- Urgency encoding (overdue / today) in row detail.
- Owns `context.signals.work` exclusively.

### Refine

| Item | Recommendation |
|------|----------------|
| **Density** | Collapsed: insight **is** the answer; **remove** duplicate primary row in body when only one item |
| **Expanded** | Cap at 3 items + “+N more in Work” — resist full task manager |
| **Urgency** | Overdue = insight-level red phrase, not chip + row + insight triple |
| **Empty** | *“Nothing needs action”* — single line, no chip |
| **vs header action** | When header CTA duplicates primary work label, Current Work should reference *“Same as header action”* or hide redundancy |

---

## 8. Focus Panel shell

### What still feels like legacy System 5

- **Header band** — close + avatar tile + mission + BOS/Manage competes with cards for attention.
- **Mode switch** — Summary / Work / Activity tabs feel like app sections, not perspectives.
- **Card chrome** — four identical bordered articles with footers = widget grid.
- **Whitespace** — center column ~440px with cards stacked; large dead zone when BOS open (shell layout, not card bug).
- **Tier left borders** on cards add visual noise in stack mode.

### Shell recommendations (polish only)

| Area | Change |
|------|--------|
| **Header** | Compress mission to one muted line; demote context chips |
| **Mode switch** | Reduce tab height; consider pill segmented control with less underline drama |
| **Grid padding** | `14px` → `16px` panel inset; cards feel inset in a canvas not floating tiles |
| **Card borders** | Hairline `1px` @ 8% opacity; rely on spacing not boxes |
| **Footer actions** | Move expand affordance to header row chevron; drop full-width footer band |
| **Background** | Panel body `#f6f8fc`, cards `#fff` — subtle canvas (already partially true) |

Goal: **the shell disappears** — operator sees subject + operational questions, not chrome.

---

## 9. Summary vs Work — recommendation

### Evaluate (do not implement)

| Option | Assessment |
|--------|------------|
| **Keep separate modes** | Work tab still renders a **different card set** (`workflow_steps`, `required_information`, `work_launcher`, `tasks`…) — duplicates Current Work + Readiness concerns. Feels like a second app. |
| **Merge immediately** | Activity (communications embed, timeline) legitimately needs horizontal workspace — merging everything loses that. Too aggressive now. |
| **Evolve (recommended)** | **Summary remains the default surface.** Work mode **shrinks** over time into **perspective depth on Work-class cards** (Current Work Expanded = today’s “Work tab”). Activity stays a distinct mode for embedded workspaces. Mode switch becomes **quieter**; “Work” tab eventually deprecated when Current Work card reaches Immersive depth. |

**Rationale:** Cards already implement Overview → Evidence → Focused → Edit. That *is* the Work experience — it should not require a mode change. Summary vs Work duplication violates “one system.” Activity is different (embedded tabs, not cards).

**Near-term:** Do not remove Work tab yet — operators may depend on it. **Do** align copy and ownership so Summary’s Current Work card is the canonical “what’s next” and Work tab feels supplemental.

---

## 10. Subject Change & cross-card flow

### Current behavior

| Flow | Behavior | Correct? |
|------|----------|----------|
| Household → Children pill | Belonging-only focus inside Household | ✅ Perspective |
| Household → Parent row | Focus primary/other parent group | ✅ Perspective |
| Children → Child row | Focus child inside Children | ✅ Perspective (Subject Change later if panel re-composes around child) |
| Readiness → Program factor | Focus inside Readiness only | ❌ Should point to Children |
| Current Work → Task row | Focus inside Current Work | ✅ Perspective |

### Target effortless path (same context, no extra clicks)

```
Readiness “Program selected”
  → panel scrolls to Children
  → expands + focuses Jonny
  → program evidence visible
  → (future) inline edit
```

**Not** Subject Change unless the **subject** of the whole panel becomes the child record.

**Refinement:** implement **Focus Panel coordination** (a minimal event bus or callback prop on `OpportunityFocusPanelModeGrid`) — not a new primitive; it orchestrates existing perspective state on owner cards.

---

## 11. Visual polish vs approved mocks

| Dimension | Mock | Runtime | Gap |
|-----------|------|---------|-----|
| Insight-first hierarchy | Strong | Moderate — body duplicates insight | Remove duplication |
| Evidence quietness | Muted sentences | KV labels + rows | Rewrite evidence |
| Stats / pills | Light outline pills | Similar ✅ | Minor border weight |
| Footer actions | Subtle / inline | Full footer band | Demote footers |
| Iconography | Home, lucide, muted | Lucide ✅ | — |
| Gauge (Readiness) | Simple bar | Implemented ✅ | Tone when blocked |
| Card spacing | Airy | Improved but stacked tight in 440px column | Accept stack; add inter-card rhythm |
| Composition | Wide + narrow pairs | Single column at operator width | See composition review §2 |

Reference mocks: `docs/sprints/archive/06_2026/household-card-mock/`, `docs/sprints/archive/06_2026/archetype-card-mocks/`.

---

## 12. Recommended changes — final refinement pass

Prioritized **product polish only** (no architecture):

### P0 — Must fix before production validation

1. **Readiness pointer model** — factor → owner card + perspective (metadata in evidence, coordination in grid host).
2. **Remove field-form KV grids** — Children Focused, Current Work Focused → sentence evidence.
3. **De-duplicate insight vs body** — one primary fact per card in Overview.
4. **Blocked Readiness copy** — diagnosis categories, not task titles.

### P1 — Strongly recommended

5. **Household headline guard** — bad contact names / address-as-name.
6. **Footer → inline expand** — reduce widget chrome.
7. **Typography pass** — insight/body/supporting scale per §3.
8. **Current Work expanded cap** — max 3 visible items.

### P2 — Shell calmness

9. **Header compression** — mission + chips quieter.
10. **Card border softening** — spacing over boxes.
11. **Mode switch visual demotion** — prepare for eventual Work tab sunset.

### Explicitly out of scope

- New cards, new archetypes, new interaction primitives
- Experience Builder wiring
- Widening Focus Panel column (product decision from composition review)
- Merging Summary + Work modes in code

---

## 13. Verdict

| | |
|---|---|
| **Architecture** | Ready ✅ |
| **Interaction model** | Ready ✅ (cross-card pointer coordination is polish on frozen Perspective Change) |
| **Product experience** | **One final refinement pass** |

After P0–P1 (~1 focused sprint): **Ready for production validation** with real leads, then Experience Builder integration and remaining archetype cards.

---

## Appendix — files reviewed

| Area | Path |
|------|------|
| Household evidence | `web/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence.ts` |
| Household UI | `web/components/admin/focusPanel/cards/HouseholdCard.tsx` |
| Children evidence / UI | `web/lib/.../children/buildChildrenCardEvidence.ts`, `ChildrenCard.tsx` |
| Readiness evidence / UI | `web/lib/.../readiness/buildReadinessCardEvidence.ts`, `ReadinessCard.tsx` |
| Current Work evidence / UI | `web/lib/.../currentWork/buildCurrentWorkCardEvidence.ts`, `CurrentWorkCard.tsx` |
| Card shell | `web/components/admin/focusPanel/UniversalCard.tsx` |
| Panel shell | `FocusPanelCompactHeader.tsx`, `FocusPanelModeSwitch.tsx`, `OpportunityFocusPanelModeGrid.tsx` |
| Styles | `web/app/adminV2/components/alloyOsRuntime.css` |
| Runtime screenshots | `docs/sprints/archive/06_2026/focus-panel-composition-review/` |
