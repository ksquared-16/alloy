# Information Architecture — Experience Builder V2

**Path:** `docs/sprints/06_2026/experience-builder-v2-runtime-editing/02-information-architecture.md`
**Status:** UX architecture sprint — design only (June 2026)
**Deliverable:** 2 — Revised Information Architecture

---

## 1. The IA inversion

In V1, the IA centered on a **builder application**: a settings queue of surfaces you navigate into. V2 inverts this.

| V1 IA (admin-centric) | V2 IA (runtime-centric) |
|---|---|
| Primary path: Settings → Design Surfaces → pick a surface → editor | Primary path: be on the live surface → **Edit** |
| The queue/gallery is *where editing starts* | The queue/gallery is *where you find surfaces you can't reach in context* |
| Editing is a destination | Editing is a state of the surface you're already on |

The browse surface still exists and matters — but it is **secondary**. Most editing begins in context.

## 2. Two complementary entry surfaces

### 2.1 In-context entry (primary)

Every runtime surface, for admins with `experience.configure`, exposes a single **"Edit this surface"** affordance (an unobtrusive control in the surface's chrome — not a global toolbar). Clicking it enters Edit Mode on that exact surface. This is the dominant authoring path and the heart of the "editable runtime."

### 2.2 Browse & Manage (secondary) — `/settings/design-surfaces`

A place to find, create, and manage surfaces that you cannot (yet) reach in context: new dashboards, document templates, communication templates, retired surfaces, platform defaults, and surfaces for entities you're not currently viewing. Selecting one **opens it in Edit Mode** (the same destination as in-context entry).

> The Browse surface answers *"which surfaces exist and what is their state?"* It is **not** where editing happens — it is a router into in-context Edit Mode.

## 3. Scalable browse IA (avoid flat lists)

The catalog will hold dozens of surfaces. The browse IA is **three levels**, never a long flat list:

```
Category            →   Domain           →   Surface
(presentation type)     (business area)      (the editable thing + state)

Focus Panels        →   Enrollment        →   Summary · Work · Activity
Queue Rows          →   Attendance        →   Compact · Expanded
Dashboards          →   Billing           →   Revenue · AR · Forecast
Analytics           →   Scheduling        →   …
Documents           →   …
Forms
POS
Communications
Reports
Portal
Mobile
```

| Level | What it is | UI |
|---|---|---|
| **Category** | Presentation type (Focus Panels, Queue Rows, Dashboards, Documents, Forms, POS, Communications, Reports, Portal, Mobile) | Top-level chips / rail |
| **Domain** | Business area (Enrollment, Attendance, Billing, Scheduling, …) | Grouped sections within a category |
| **Surface** | The editable Design Surface + its state badge (Working Copy / Published / Retired / Default) | Cards/rows; selecting opens Edit Mode |

Navigation honors the Configuration Mode shell pattern (Context → Queue → Workspace → BOS) so it feels like the rest of Alloy — but its job is **routing**, not editing.

## 4. Cross-category consistency

The browse IA is **identical in shape** across categories. Switching from "Focus Panels" to "Dashboards" changes the *content* of the list (and the Card Types/Renderers available once you edit), never the navigation model. This is the IA expression of the "Analytics is identical" law.

## 5. Inheritance-aware IA (future-anticipating)

The IA anticipates the cascade without implementing templates today:

```
Platform Defaults
  → Industry Defaults
    → Organization
      → Location
        → Viewpoint
          → Overrides
```

| IA accommodation | How it appears in V2 |
|---|---|
| **Scope is a lens, not a tree** | The browse list can be filtered by scope ("Show: Organization / North Campus / Director Viewpoint"). Editing a surface at a scope shows the **Scope chip** in the Edit Bar. |
| **Defaults are visible but distinct** | Platform/Industry defaults appear in browse as read-only references you can **fork into an override**, never edit in place. |
| **Overrides are discoverable** | A surface shows where it has been overridden (which Locations / Viewpoints differ from Org), so admins understand the cascade at a glance. |
| **No template-management screens yet** | Industry templates are not implemented; the IA simply reserves the scope dimension so adding them later needs no restructure. |

## 6. Surface state model in the IA

Every surface in browse carries a state badge consistent with the publishing lifecycle:

| Badge | Meaning |
|---|---|
| **Working Copy** | Unpublished edits exist |
| **Published vN** | Live; version number |
| **Retired** | No new assignments; existing continue |
| **Default** | Platform/Industry-owned; fork to override |
| **Assigned ×N** | Number of BP/Work View/Viewpoint assignments |

## 7. Relationship to Business Processes (unchanged ownership)

- Surfaces are **authored** here (in context or via browse) and **assigned** in Business Processes / Work Views — frozen ownership split (`configuration-ownership-doctrine.md`).
- From a Work View's assignment, "Edit in Design Surfaces" opens the assigned surface in Edit Mode (in-context entry from the assignment).
- No Queue Builder / Focus Panel Builder as separate apps (frozen).

## 8. Settings nav placement

Unchanged from the Presentation Runtime sprint: the Configuration Mode rail item is **"Design Surfaces"** (`/settings/design-surfaces`), aliasing `/settings/layouts` during transition. Operational Intelligence remains the home for metric *definitions*; Design Surfaces hosts metric *placement + visualization* (dashboards).

## 9. URL structure

```
# In-context (primary) — Edit Mode is a state on the runtime route, not a new route
/workspace/...?edit=1                         → enter Edit Mode on the current surface
/workspace/...?edit=1&mode=structure          → Structure Mode
/workspace/...?edit=1&scope=location:north    → editing a Location override

# Browse & Manage (secondary)
/settings/design-surfaces                      → browse (category level)
/settings/design-surfaces?category=focus-panel&domain=enrollment
/settings/design-surfaces?surface={id}         → opens that surface in Edit Mode
```

Edit Mode being a **query state on the runtime route** (not a separate `/builder/...` route) is the IA-level expression of "you never leave the product."

## 10. Cross-references

| Concern | Doc |
|---|---|
| Interaction model | [`01-runtime-editing-interaction-model.md`](./01-runtime-editing-interaction-model.md) |
| Edit Mode lifecycle | [`03-edit-mode-doctrine.md`](./03-edit-mode-doctrine.md) |
| Prior sprint IA (superseded for authoring path) | `../presentation-runtime-architecture/03-information-architecture.md` |
| Configuration ownership | `docs/system/configuration-ownership-doctrine.md` |
