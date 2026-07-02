# Experience Builder V3 — Part 1: Platform Audit

**Status:** Audit complete. Returned before implementation (per sprint instruction).
**Branch:** `claude/experience-builder-v3` (from `origin/staging` @ 34c6e6273).
**Method:** Four parallel deep-reads of the four builder areas against the proposed target hierarchy, cross-referenced with the canonical doctrine (`presentation-runtime-doctrine.md`, `experience-builder-doctrine.md`, `universal-card-lifecycle.md`, `operational-grain-doctrine.md`, `queue-row-platform.md`).

Target hierarchy under evaluation:
`Surface → Perspective → Component → Evidence Group → Composition Item (Field | Widget | Related List | Calculation | AI Summary | Action) → Conditions → Actions`

---

## 0. The one-paragraph verdict

The composition *model* the sprint wants **already exists** — but split across **two rival engines that share no types**, with the richest hierarchy (Evidence Group → Composition Item → Conditions) living in the engine that *can't* yet do recursion, and the cleanest recursion-ready seams living in the engine that *doesn't* have the hierarchy. Convergence is therefore **not** "build a new composition engine." It is: **(1) pick one canonical document model, (2) grow it the two layers it's missing, (3) add one recursion primitive, (4) wire in machinery that already exists** (custom-field availability, named evidence groups). Two doctrine invariants explicitly *forbid* the keystone move ("expanded is another surface") and must be consciously reconciled — that is a decision, not a refactor. And the sprint's proposed term **"Perspective" collides with a frozen platform primitive** and must be renamed before we freeze anything.

---

## 1. The two rival composition engines (the load-bearing finding)

| | **Engine A — `surfaceBuilder/`** | **Engine B — LayoutDoc stack** |
|---|---|---|
| Document type | `SurfaceDoc` (`surfaceDefinition.ts:40`) | `LayoutDoc` + `QueueRecordLayoutConfigV3` + `FocusPanelCardConfig` |
| Shape | Surface → Section → Card → `contentId` | Surface → Card → **Evidence Group → Composition Item** |
| Drives | Operational Intelligence, Workspace/Work-Unit Headers | **Focus Panel, Queue Row** |
| Branch-free on surface type | ✅ yes (`surfaceDefinition.ts:6-8`) | ❌ each surface is its own stack |
| Evidence Group / Composition Item | ❌ absent (card = one scalar `contentId`) | ✅ first-class (`FocusPanelEvidenceGroup`, `QueueRecordBlockConfig`) |
| Conditions / Actions | ❌ only `promotedTo[]` placement | ✅ `visibleWhen` / condition grammar |
| Recursion (surface→surface) | ❌ none | ❌ none |
| Injection seams (content/renderer/persistence) | ✅ clean, declarative | ❌ hardcoded per surface |
| Persistence | `metric_placements` | `entity_layouts` / `queue_record_layout` |

`SurfacesConfigurationPage.tsx:84-94` fans out to **four different editor implementations**; only two of them (OI + Headers) share Engine A. Queue Row and Focus Panel share nothing with it, and little with each other.

> **Decision #1 (gates everything): which engine is canonical?**
> - Engine A has the cleanest "add a surface, not a builder" seams but the thinnest card model.
> - Engine B owns the real hierarchy but is three hand-authored stacks with no recursion.
> Recommendation in §9.

---

## 2. Vocabulary reconciliation (must settle before freezing the doctrine)

The sprint proposes `Surface → Perspective → Component → Evidence Group → Composition Item`. The platform **already has canonical names** for most of these, and one **hard collision**:

| Sprint term | Existing canonical term | Status | Source |
|---|---|---|---|
| Surface | **Design Surface** | ✅ same concept, keep | `presentation-runtime-doctrine.md:48` |
| **Perspective** | **Perspective = operating lens (saved filter/sort/grouping), FROZEN, "not renamed"** | 🔴 **COLLISION** | `presentation-runtime-doctrine.md:74-77` |
| Component | **Card** | ✅ same concept, keep "Card" | `universal-card-lifecycle.md` |
| Evidence Group | Evidence Group | ✅ already canonical | `experience-builder-doctrine.md:62-79` |
| Composition Item | Slot → Renderer / "Fields, Widgets, Actions are peer primitives" | ✅ compatible | `experience-builder-doctrine.md:316-326` |
| (audience axis) | **Viewpoint** (Director/Teacher/Parent/Corporate) | already exists — relevant to Portals | `presentation-runtime-doctrine.md:75` |

**The collision:** the sprint's "Perspective" layer is really the **card lifecycle / depth axis** — Summary → Focus → Edit → **Expanded** → Workspace (`universal-card-lifecycle.md:22-29`), already implemented as `CardPerspectiveExpansion` / `focusPanelCardLifecycle.ts:28`. But "Perspective" is a *frozen* Selection-axis primitive meaning something entirely different. Freezing a doctrine that redefines it would break the Presentation Runtime doctrine.

> **Decision #2: rename the sprint's middle layer.** Recommendation: the layer between Surface and Card is **not a new noun** — it is the existing **Lifecycle/Depth** axis, and its key property is that a card's **Expanded/Workspace** state *resolves to a nested Surface*. See §3 and §9.

---

## 3. The keystone: "Expanded is another Surface"

**Today, across both engines, expansion = "more fields," and the current doctrine explicitly forbids it being a surface.**

- Focus Panel "Expanded" = filter which fields of the *same card* show (`focusPanelCardConfigModel.ts:500-505`), rendered as a downward overlay that is *"never a new surface"* (`CardInlineOverlay.tsx:24-33`; invariant `focus-panel-composition-v2-and-editing.md:141-143`).
- "View Children" is **local card state**, not a surface: `ChildrenCard.tsx:187-231` flips `rosterOpen` and renders a hardcoded `FocusedChild` component inside the same card `div`. No `surfaceId`, no nested `SurfaceDoc`, no recursive compose call exists anywhere (`grep nestedSurface|childSurface|surfaceRef` → 0 hits).
- `card-interaction-expansion-doctrine.md:54-88` defines Expand as "same subject, body expands inline."

**But the enablers are already present** — the recursion is closer than the doctrine implies:
- Focus Panel's published-layout type (`focusPanelPublishedLayout.ts`) can already describe an arbitrary card composition — a "Children Surface" is just another such layout.
- A single shared compose path (`composeFocusPanelSurface.ts`) never forks the renderer.
- The overlay host (`CardInlineOverlay.tsx`) is the natural mount point for a recursively-composed nested surface.

**Smallest end-to-end recursion (proof):** add one optional field `expandedSurfaceId?` to the evidence group / card; when present, the overlay body renders that named surface back through the *existing* compose+grid path instead of filtering fields. Replace `ChildrenCard`'s hardcoded `FocusedChild` with a composed Children Surface. ~1 field + 1 surface catalog entry + 1 recursive render branch — not a new subsystem.

> **Decision #3: reconcile the two doctrine invariants** (`focus-panel-composition-v2-and-editing.md:141-143`, `card-interaction-expansion-doctrine.md:54-88`) that currently forbid nested surfaces. These are doc-only; the sprint's premise requires them to change to "Expanded/Workspace may resolve to a nested Surface."

---

## 4. Queue Row Builder

**The V3 runtime schema is already close to target; the *builder substrate* is the work.**

Aligned: `QueueRecordBlockConfig` (field_group / repeated_record_block / widget), field-level `visibleWhen` (Composition Item → Conditions is representable), V2's registry-backed **named** evidence groups + per-field toggles.

Gaps (highest-leverage first):

| # | Gap | Evidence | Fix scale |
|---|---|---|---|
| Q1 | **Pipeline/Waitlist two-surface fork** in 5 places | `surfaceLibrary.ts:49-66`; `isWaitlist` `QueueRowBuilderV2.tsx:851`; two default factories `queueRecordLayoutV3.ts:244,481`; registry override `compositionEvidenceGroupRegistry.ts:123`; placement-override gate `QueueRowBuilderV2.tsx:763` | Collapse to **1 surface + conditions** — schema already supports `visibleWhen` (`IF placement_status = waitlisted THEN show position/tier/wait-since/…`) |
| Q2 | **No stacked sections** — flat top-level `columns[]`, single horizontal strip | `queueRecordLayoutV3.ts:112-117`; single-flex render `QueueRowBuilderV2.tsx:349` | **Schema version bump** (add `sections`/`rows` wrapper) — the sprint's "Household\|Status / Children\|Attention / Actions" is not representable today |
| Q3 | **Fixed 6-zone enum, width-keyed identity** | `surfaceLayoutRegistry.ts:410`; `ZONE_WIDTH_MAP`/`colByWidth` `QueueRowBuilderV2.tsx:73,159` | Replace width-keyed zones with real block/column ids ("Canvas → Blocks") |
| Q4 | **Grain is a static `isWaitlist` label, not a persisted selectable axis**; no Child-grain default exists | `QueueRowBuilderV2.tsx:851-853`; no `grain` in `QueueRecordLayoutConfigV3`; doctrine §8.2/§8.6 | Add `grain` to config + grain selector; matches `operational-grain-doctrine.md` |
| Q5 | Field content triplicated & static | default factories + registry `defaultFieldKeys` + `QUEUE_FIELD_CATALOG` | Wire tenant catalog (see §6) |
| Q6 | Abstract names in V1 + fallback paths | `QueueRowBuilderV1.tsx:106-107` | Retire V1; guarantee registry coverage |

---

## 5. Focus Panel Builder

Aligned: Evidence Group is first-class and named; concept-path binding (never raw columns); conditions + related views + ownership all implemented; capability matrix drives runtime/inspector with no per-card hardcoding.

Gaps:
- **Composition Item taxonomy is incomplete.** Only `kind: field | collection` exist (`focusPanelCardConfigModel.ts:71`). Widget / Calculation / AI Summary / Action are **not** first-class item kinds (AI is doc-only advisory).
- **Seeds are hardcoded in three hand-synced places** that are already drifting: `defaultEvidenceGroupsForCard` (`focusPanelCardConfigModel.ts:240-285`), `FOCUS_PANEL_CARD_EVIDENCE_GROUPS` (`compositionEvidenceGroupRegistry.ts:187-225`), and `CONCEPT_TREE` (`focusPanelConceptCatalog.ts:30-71`). Seed group "Placement" binds concept paths the `CONCEPT_TREE` picker cannot produce (`children` branch lacks Program/Room/Schedule/Teacher/Desired-Start leaves).
- **Abstract "Details" fallback is still the default** for every non-reference card (`DEFAULT_EVIDENCE_GROUP_LABEL = "Details"`, `:208-209`) — most of the "next 36 cards" get the abstract bucket until authored.
- **Grid/geometry jargon leaks** to operators: "span columns/rows", "12-column grid", "Row N", "stacked", "Compose layout" (`FocusPanelGridCanvasBuilder.tsx:149,203-205`; `FocusPanelRowLayoutBuilder.tsx:69,106,185`).

---

## 6. Field Availability (Part 6) — already built, just not wired

**This is the most encouraging finding: the custom-field-by-namespace capability already exists and is proven in production paths — it is simply not consumed by the Universal Composition adapter.**

- `tenantLayoutFieldPickerCatalog.ts` already provides `buildTenantLayoutCatalogFields(defs, surface)` (`:181`), `mergeTenantFieldsIntoPickerGroups` (`:198`), namespace mapping `fieldDefinitionEntityToLayoutGroupKey` (`:46`), and the surface-compatibility gate `isTenantLayoutFieldAllowedOnSurface` (`:106-165`).
- It is **wired into** the field-catalog API route (`route.ts:219-222`), all three drawer editors, and the queue-record picker — so custom fields **already flow** in those surfaces.
- It is **NOT wired into** `compositionFieldAdapter.ts`, which the V2 Queue/Focus builders use — that adapter reads only the static `QUEUE_FIELD_CATALOG` by design (`:6-16`).

**Minimal integration (5 concrete points):**
1. Add `acceptedNamespaces: AvailableFieldEntityNamespace[]` to `CompositionEvidenceGroupDef` (`compositionEvidenceGroupRegistry.ts:25-38`) and populate (e.g. `household → [customer, person]`, `children → [child, inquiry_child]`).
2. Thread `tenantFieldDefinitions?` into `namedEvidenceGroupsForZone` / `availableFieldsForZone` (`compositionFieldAdapter.ts:182,204`).
3. Merge tenant `LayoutCatalogField`s whose namespace ∈ the group's `acceptedNamespaces`.
4. Load + pass `field_definitions` from the builder (`QueueRowBuilderV2.tsx:194`).
5. OR-in `isTenantLayoutFieldRefKeyAllowed` to the queue validator allow-list (`queueRecordValidatorAllowList.ts:151-157`) so published custom refKeys pass.

Net: **a wiring gap + one metadata field**, not a missing subsystem. "Preferred Language / Employer / Referred By / Pickup Code / Emergency Notes" flow into every compatible evidence group by namespace.

---

## 7. Naming (Part 7) & Navigation (Part 8)

- **Naming:** V2 Queue + reference Focus Panel cards are clean (business names via `compositionEvidenceGroupRegistry`). Residual abstraction: `"Details"` default group, `"Group N"/"Block N"/"Evidence group N"` fallbacks (V1 + both builders' miss paths), and grid jargon (§5).
- **Navigation:** `settings/surfaces` is a **Context → Section → Object** shell organized by *surface category* (`focus-panels`, `queue-rows`, `headers`, `dashboards`). It is **not** a uniform tree of composable surfaces, and it does **not** reflect nested surfaces (there is no "Children Card → Children Surface" breadcrumb because nested surfaces don't exist yet). The **Surface Library is a hand-maintained duplicate**: two catalogs (`SURFACE_LIBRARY` + `SURFACE_OBJECTS`) with matching ids and no discovery from actual `SurfaceDefinition`s.

---

## 8. Consolidated gap ledger

| Area | Gap | Kind | Leverage |
|---|---|---|---|
| Architecture | Two rival engines, no shared document model | **Decision** | ★★★★★ |
| Doctrine | "Perspective" term collision | **Decision** (rename) | ★★★★★ |
| Doctrine | "Expanded = surface" forbidden by 2 invariants | **Decision** (reconcile) | ★★★★★ |
| Recursion | No surface→surface primitive anywhere | Build (small) | ★★★★★ |
| Queue | Pipeline/Waitlist fork (5 sites) | Build | ★★★★ |
| Queue | No stacked sections (flat `columns[]`) | Schema bump | ★★★★ |
| Queue | Grain not persisted / not selectable | Build | ★★★ |
| Focus Panel | Seeds hardcoded ×3, drifting from catalog | Build | ★★★ |
| Focus Panel | Composition Item taxonomy incomplete | Build | ★★★ |
| Fields | Custom-field availability not wired into adapter | **Wire (exists!)** | ★★★★ |
| Naming | "Details" default + fallbacks + grid jargon | Polish | ★★ |
| Navigation | Duplicate library catalogs; not surface-tree | Build | ★★ |

---

## 9. Recommendations feeding Part 2 (the doctrine)

1. **Canonical engine:** make **Engine B's document model the semantic source of truth** (it owns Evidence Group → Composition Item → Conditions, the layers that actually matter to operators), but **adopt Engine A's injection seams** (`ContentSourceProvider` / `RendererDefinition` / `SurfacePersistenceAdapter`) as the *plumbing*. i.e. one `SurfaceDoc` whose cards host evidence groups. Do **not** keep both.
2. **Vocabulary (freeze this):** `Design Surface → Card → Evidence Group → Composition Item`, with **Conditions** and **Actions** as cross-cutting facets on items/groups. The lifecycle/depth axis (Summary/Focus/Edit/**Expanded**/Workspace) stays as-is and is **not** called "Perspective." **Expanded/Workspace resolve to a nested Surface** via `expandedSurfaceId`. Reserve "Perspective" for the frozen selection lens and "Viewpoint" for audience.
3. **Recursion primitive:** `expandedSurfaceId?` on card/evidence-group; recursive render through the existing compose+grid path.
4. **Prove it with one recursive surface** end-to-end — recommend **Children Surface** (the code path is already 80% there in `ChildrenCard`; Financial Config Surface is a heavier build).
5. **Queue convergence:** one Queue Row Surface, grain axis (Family/Child) + conditions (waitlist as a condition, not a surface); schema v4 adds stacked sections.
6. **Field availability:** wire the existing tenant-catalog machinery into `compositionFieldAdapter` + `acceptedNamespaces` metadata.

Parts 2–9 proceed once Decisions #1–#3 are confirmed.
