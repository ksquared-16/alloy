# Edit Mode Doctrine

**Path:** `docs/sprints/archive/06_2026/experience-builder-v2-runtime-editing/03-edit-mode-doctrine.md`
**Status:** UX architecture sprint — design only (June 2026)
**Deliverable:** 3 — Complete Edit Mode doctrine

---

## 1. Definition

**Edit Mode** is a state of the runtime in which editing affordances are revealed on the surface in front of the operator. It is not a route, an application, or a modal. Entering and exiting Edit Mode changes *which affordances are visible*, never *which surface is rendered*.

## 2. Entering Edit Mode

| Property | Behavior |
|---|---|
| **Trigger** | An "Edit this surface" affordance, visible only to operators with `experience.configure`. In-context (on the live surface), from a Work View assignment, or from the browse surface. |
| **Transition** | The Edit Bar slides in at the top of the surface. The surface stays in place — no reload, no navigation, no layout shift. A working copy is created (or resumed) on first edit, not on entry. |
| **Default mode** | **Content Mode** (most edits are content). Structure Mode is one toggle away. |
| **Default scope** | **Organization** (the most common authoring scope). Switchable via the Scope chip. |
| **Default version** | The latest **Working Copy** if one exists; otherwise a fresh working copy derived from the current Published version. |

Entry is reversible and side-effect-free until the first actual edit. Merely entering Edit Mode and leaving creates nothing.

## 3. Exiting Edit Mode

| Exit | Result |
|---|---|
| **Done** | Returns to Viewing. Working copy is saved (auto-saved continuously). Nothing is published. |
| **Publish then Done** | Promotes working copy to Published, then returns to Viewing of the new published version. |
| **Navigate away** | Working copy persists; a subtle "Editing in progress" indicator appears if the operator returns to the surface. |
| **Discard working copy** | Explicit, confirmed action; deletes unpublished edits and returns to the Published version. |

There is no "unsaved changes" trap door — edits auto-save to the working copy. The decision the operator makes is **Publish or not**, never **Save or lose**.

## 4. The working copy model

```
Published (live)  ──fork on first edit──▶  Working Copy (yours)
                                              │ auto-saves continuously
                                              │ rendered by the real runtime
                                              ▼
                                           Publish ──▶ new Published version
```

| Concept | Meaning |
|---|---|
| **Working Copy** | A single in-progress draft per surface per scope. Not visible to operators in Viewing. Rendered by the same runtime as Published. |
| **Auto-save** | Every edit persists to the working copy immediately (debounced). No manual save. |
| **One working copy per scope** | Org has one; each Location override has one; each Viewpoint override has one. They do not collide. |
| **Promotion** | Publish turns the working copy into an immutable Published version (N+1) and clears the working-copy "dirty" state (the working copy now equals Published until the next edit). |

## 5. Publishing

| Property | Behavior |
|---|---|
| **Action** | "Publish" in the Edit Bar. |
| **Validation (pre-publish)** | Required slots filled or explicitly optional; no unresolved data sources; no publish-blocked items (preview-only renderers, deprecated blocks). Failures list inline with "jump to" links to the offending element on the surface. |
| **Impact analysis** | A compact confirmation shows downstream reach: *"Assigned to 3 Work Views and 1 stage. Publishing updates the runtime for all of them."* Plus scope: *"Publishing at Organization scope."* |
| **Result** | New immutable Published version. Runtime reads it immediately for all assignments at that scope. |
| **No staging detour** | There is no separate "send to preview" step — the working copy *was* the preview. Publish goes straight from working copy to live. |

## 6. Versioning

| Property | Behavior |
|---|---|
| **Version on publish** | Every Publish creates a numbered version with author + timestamp. |
| **History** | The Edit Bar's "History" opens a version timeline in place (not a new screen). Each entry shows author, time, and a one-line change summary. |
| **Diff** | Selecting two versions highlights changed zones/cards/slots **on the surface itself** (the surface becomes the diff view — added/removed/changed elements get markers), not in an abstract JSON diff. |
| **Restore** | "Restore this version" creates a **new** Published version equal to the chosen one (never rewrites history). The working copy updates to match. |
| **Retire / Restore surface** | A whole surface may be retired (no new assignments; existing continue) and later restored — consistent with the canonical publishing lifecycle. |

## 7. Runtime states recap (Preview removed)

| State | Selected from | Purpose |
|---|---|---|
| **Viewing** | Done / exit | The published operator experience |
| **Working Copy** | Default while editing | Your live, auto-saved edits |
| **Published** | Working-copy status menu | Read-only reference for comparison |
| **History** | History timeline | Inspect / restore prior versions |

"Preview as Viewpoint" and "preview against record X" are **lenses on the Working Copy**, selected via the Scope chip and a record picker — not a separate state.

## 8. Scope & inheritance during editing

- The **Scope chip** declares the active scope: Organization (default), a Location, or a Viewpoint.
- Editing at a child scope creates an **override** of the inherited surface, not a clone.
- Inherited elements show ⓘ; overridden elements show ✎; platform-locked elements show 🔒.
- "Reset to inherited" reverts an override in place.
- Publishing applies at the active scope only; parent scopes are untouched.

This is the V1 surfacing of the Platform → Industry → Org → Location → Viewpoint → Operator cascade. No additional builder screens are introduced for inheritance.

## 9. Collaboration assumptions

This sprint sets **assumptions**, not an implementation. They exist so the model is forward-compatible.

| Assumption | Stance for V1 |
|---|---|
| **Concurrency** | One working copy per surface per scope. If two admins edit the same scope, the model assumes **last-write-wins per element with a soft presence indicator** ("Maria is also editing"). Hard locking is out of scope. |
| **Presence** | The Edit Bar may show co-editor avatars; non-blocking. |
| **Hand-off** | Working copies are org assets, not personal drafts — any `experience.configure` admin can resume a working copy. |
| **Review/approval** | Out of scope for V1, but Publish is the natural gate. A future "request review before publish" step can sit between working copy and Published without changing the model. |
| **Audit** | Every Publish is attributable (author + timestamp + version). Working-copy edits need not be individually audited in V1. |
| **BOS** | BOS may *propose* edits to the working copy (propose → human approve → apply); it never publishes autonomously. |

## 10. Permissions

| Capability | Gate |
|---|---|
| See "Edit this surface" | `experience.configure` |
| Edit at Organization scope | `experience.configure` |
| Edit at Location scope | `experience.configure.location` (site-scoped) |
| Edit at Viewpoint scope | `experience.configure.viewpoint` |
| Publish | `experience.publish` (may be same as configure in V1) |

Permissions gate **authoring capability**. They are distinct from Viewpoints, which gate **operator presentation**. (Frozen distinction — `archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md` §5.)

## 11. Non-negotiables

- Edit Mode **never mutates record truth.** It edits presentation config only. No record fields, statuses, or workflow state change because someone is editing a surface.
- Edit Mode **never weakens reveal/performance gates.** No editing-only skeletons; no layout shift entering/exiting; the working copy reveals exactly as the published surface would.
- Edit Mode **never introduces a second renderer.** Working Copy and Published are drawn by the same runtime.

## 12. Cross-references

| Concern | Doc |
|---|---|
| Interaction model | [`01-runtime-editing-interaction-model.md`](./01-runtime-editing-interaction-model.md) |
| Structure Mode | [`04-structure-mode-doctrine.md`](./04-structure-mode-doctrine.md) |
| Content Mode | [`05-content-mode-doctrine.md`](./05-content-mode-doctrine.md) |
| Walkthroughs (publish, undo, history, restore) | [`06-interaction-walkthroughs.md`](./06-interaction-walkthroughs.md) |
| Canonical publishing/inheritance | `docs/platform/operator/archive/2026-06-presentation-runtime/presentation-runtime-doctrine.md` §9 |
