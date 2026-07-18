---
owner: operator
status: canonical
last_reviewed: 2026-07-17
supersedes: []
---

# Configuration Workspace Component Library

**Status:** Canonical. The primitive vocabulary of the Configuration Workspace Platform.
**Companion:** `configuration-workspace-platform-doctrine.md` (behavior) and `configuration-workspace-visual-language.md` (appearance).

> These are **platform concepts**, not React components. A domain implements them however its stack requires; what is canonical is the concept, its responsibility, and its contract with the operator.

Every configuration domain composes its experience from this fixed set of primitives. A domain that needs a new primitive must add it here first — the library is the shared language, and a one-off widget outside it is an anti-pattern.

---

## Structural primitives

### Configuration Workspace
The root of a configuration experience for one object type. Owns the three-zone layout (object list · object detail · command rail), URL-addressable selection state, and responsive collapse. It is the container every other primitive lives inside. One per object type (Locations, Programs, Offerings…).

### Workspace Canvas and Region
The Canvas is the quiet Stone field behind the selected object's detail. A Region is a coherent white operational answer on that field — glance, readiness, attention, capability, or editor. Regions do not acquire object identity, selection, or nested card chrome unless they actually represent an Object.

### Configuration Sidebar (Object List)
The persistent selector for objects of the current type. Responsibilities: search, filter, "Add", and an unmistakable **selected** state. Swaps to a child object's siblings when the operator drills into a nested object. It is a selector, never a page.

### Publishable Configuration Collection
The complete catalog runtime for publishable objects. It composes the Configuration Sidebar with publication posture, durable assignment posture, Attention, Setup/Readiness, lifecycle filtering, and responsive object selection. Domains supply object nouns and authoritative evidence; the runtime owns the grammar. A transient workflow result is never collection posture.

### Configuration Domain Empty State
The first-use explanation for an empty Configuration Collection. It teaches what the domain is, why the Organization owns it, common examples, how setup flows, and the recommended next action. It is not a generic "no data" placeholder. The Runtime owns the composition; each domain supplies its operator nouns, examples, ownership consequence, and setup steps.

### Configuration Runtime Notice
The operator-safe presentation of unavailable Configuration. It distinguishes uninitialized domains, pending platform updates, denied access, temporary service unavailability, and failed actions. The operator sees consequence and next step, never table names, SQL, PostgREST codes, schema-cache language, or provider internals. Engineering receives the raw diagnostic in server logs under a short reference shown to the operator.

### Configuration Object Header
Names the object being operated: object name (dominant), status badge, one row of identifying facts, and the object's primary action + overflow. The answer to "what am I configuring?" Every object workspace has exactly one.

### Workspace Tab Bar
The object's **owned concerns** as tabs, led by Overview. Route-addressable. Tabs name concerns in business language, never features or subsystems.

### Publishable Configuration Detail Runtime
The read-first object runtime for domains using immutable publication. It always opens on **Overview**, then conditionally exposes Working Draft, Assignments, Distribution, and History. Active Revision and Working Draft are separate evidence; Impact belongs to assignment preparation. Domains provide payload-specific summaries and editors but do not rebuild section navigation, revision posture, Attention, or history.

The Overview begins with domain orientation: purpose and ownership. It then presents active revision, working draft, assignment posture, the authoritative domain summary, Attention, and readiness before any editor.

### Workspace Section
A calm, self-contained block for one concern: a plain headline, quiet supporting detail, and one clear affordance. Sections are structured rows within a card, not a mosaic of boxes. Sections are where inline editing happens.

### Command Rail
The object-scoped rail holding Quick Actions and (where useful) the object's Attention/Setup. Restrained by doctrine — a short action list and one or two status cards, never a dashboard.

**Configuration ownership (proven by Locations):** Configuration content pages **do not** render a page-local Actions card. Contextual commands register into the **platform shell Actions rail** (above BOS) via `WorkspaceCommandRailRegistrar` / `LocationsCommandRailActions`. The page owns understanding and state; the shell owns commands; BOS remains a separate assist surface. Inline controls stay attached to the content object they affect.

---

## Operational-summary primitives

### Operational Summary (Glance)
The read-only "is this object healthy?" surface. Presents derived state (capacity, availability, counts) with **utilization first, inventory second**, each number a link to where it is configured. Shows honest unknowns, never fabricated zeros.

### Attention Panel
The live, ranked list answering "is anything wrong or improvable right now?" Items are graded Fix / Improve / Good, each one-tap actionable and self-clearing. Empty state: "Everything looks good." No timestamp, no global health badge. This **is** the health model.

### Setup Progress
The onboarding completeness surface: a percentage/progress indicator plus a concise per-owned-area checklist, each linking to its configuration concern. Every row names its state as **Complete**, **Needs setup**, **Not assessed**, or **Not applicable** when the domain can prove it. The percentage visibly reconciles with assessed rows. Distinct from Attention by responsibility: Setup Progress explains readiness; it does not create a second task list. **Unknown areas (`complete === null`) are excluded from the denominator** — unknown is never incomplete.

### Operational Action Model
Ranked actions on the command rail, grouped **Fix now → Do next → Manage**. Domains supply actions from Attention + high-frequency operations; the primitive only groups and presents. Replaces ad-hoc “Quick actions” button lists.

### Scope Context Bar
Organization (global) vs the selected configuration object. Switches the operator between the Organization landing and the object workspace without inventing another collection noun.

### Apply To Dialog
Multi-select targets + confirm for a domain with an authoritative copy/apply provider. Domains supply targets and the durable mutation. The primitive remains hidden when no provider exists; confirmation may never imply a copy occurred when only a proposal was produced.

### Assignment Runtime
The durable identity of where a published object is consumed. It shows current Location assignments, consumed revision, update/drift posture, and latest assignment health separately from pending target selection. Assignment workflows may preview Impact and confirm distribution, but their checkboxes never replace the durable posture.

### Distribution Runtime
The cross-revision presentation of deterministic assignment/delivery runs. It shows per-target outcomes, partial failure, safe retry, and the latest result under the same run identity. Failures project into Attention; successful targets are not visually or operationally replayed.

### Configuration Health Banner
A per-object or per-section rollup of substrate resolution status into a single calm statement ("All good" / "Needs setup"). A compact form of Attention for tight spaces (e.g. a nested object's rail). Never a "last checked" heartbeat. **Do not introduce a third status system named Health** — Attention remains the live health model; this banner is Attention in compact form.

---

## Object-and-list primitives

### Configuration Object List
The set of object rows within the Sidebar (or a grid, for a no-selection tab). Each row carries object identity + status + a one-line derived signal ("Holds 11 · 2 open"), and marks incomplete objects ("Needs setup") honestly.

### Configuration Domain Card
The compact publisher-landing navigation object for one configuration domain. It carries domain identity, publication state, one concise description, at most three owned concerns, a small Used By summary, and one Open affordance. Cards are equal height for scanning and are not dashboard metrics. Publisher detail, operator home, inheritance, overrides, and health explanation belong inside the domain runtime through progressive disclosure. The canonical implementation is Organization Configuration Runtime V2.1.

### Configuration Status Badge
The object's active/inactive (or domain-equivalent) state as a soft, dotted chip. Calm, small, meaningful — Bend-Pine for good/active, Stone for inactive, ember reserved for problem states.

### Configuration Empty State
The primer shown when an object or concern has nothing configured: a one-line reason, the first step, and the matching Add/Set action. For a brand-new object, a short setup checklist. Never a blank form.

---

## Editing primitives

### Inline Property
The default editing unit: a value the operator can change in place (a number, a toggle, a short list) that validates beside itself and saves optimistically. Wraps any concern the object already displays so editing never navigates away.

### Focused Editor
A dedicated section/tab for one rich concern (capacity + ratios, a weekly schedule) — a small set of business fields plus a **Consequence Sentence**, plus one save. A focused editor is still not a form.

### Consequence Sentence
A live, plain-language line restating the substrate's computed result as a business outcome ("Right now this room holds 11 children — limited by staffing ratios"), updating as the operator edits. The bridge that keeps the engine invisible while making its effect legible.

### Effective-From Save
The save affordance that quietly carries an effective date ("Save changes · Effective from Today ▾"). A future date produces a **Scheduled ribbon** with Undo. Encapsulates versioning so the operator never meets it.

### Inherited Value
A value shown with a quiet owner tag ("Uses Downtown Campus hours") plus a one-gesture override ("Set different hours for this room"). Removing the override returns to inherited silently. The sole presentation of inheritance — never precedence.

### Basis Popover (ⓘ)
The affordance that reveals a derived number's plain-language basis ("21 open = 124 capacity − 103 enrolled"). Keeps math out of the surface while keeping it available on demand.

### Configuration Dialog
A centered modal for exactly two jobs: **create** an object, or **confirm** a destructive act. States the business consequence. Never used to manage an existing object; never contains version/scope/precedence language.

---

## Contextual primitives

### Configuration Timeline (Change History)
An on-demand, plain-language history of what changed and when ("Capacity was 12, changed to 14 on May 20 by Sarah J."). For publishable domains it includes immutable revisions, assignments, retries, and failures across all revisions. A successful retry updates current distribution posture but never removes the original failed attempt from History. Never exposes `effective_start`, `supersedes`, checksums, provider keys, or raw version ids.

### Configuration Activity Feed
The object's recent changes as a short list — actor · plain summary · relative time · deep-link. A read surface, not an audit console.

---

### Child Object Master/Detail
The reusable nested-object pattern (Rooms inside Locations; future Programs, templates, etc.). List selects; detail answers what is configured / needs attention / next action **before** exposing editors. Editing is intentional (Adjust), not the default posture.

### Consequence Line
A live, plain-language line restating the substrate's computed result as a business outcome for the focused child object.

### Authoritative Mutation Boundary
The shared save contract for every editor and inline mutation. The server returns the changed object or layer; the client proves the response contains the submitted patch before leaving edit mode, then updates every dependent list, summary, Attention, and Readiness consumer. Hard refresh must reproduce the same state. HTTP `2xx` alone is never success.

---

## Composition rules

- A configuration experience is **assembled from these primitives only.** New visual needs extend the library, not the domain.
- Primitives depend on the **object model and resolved view models**, never on raw database rows. Only server loaders touch the substrate.
- Every primitive obeys the platform laws: the engine stays invisible, unknown is never zero, inheritance is quiet, editing is in-place, and the two status systems stay separate.
- The reference implementations live in `web/components/adminV2/settings/organization/`, `web/components/adminV2/settings/locations/`, and `web/components/adminV2/settings/configurationRuntime/workspace/`. Organization presents the configuration domain catalog; Locations presents the Location collection and entry into each Location workspace.

## Related docs

- `configuration-workspace-platform-doctrine.md` — the behavior these primitives implement.
- `configuration-workspace-visual-language.md` — how they look.
- `../../system/operational-configuration-platform-phase-b-blueprint.md` — the reference-implementation mapping of primitives to the Locations build.

## When this doc must be updated

A primitive is added, merged, split, or retired; or a primitive's responsibility/contract changes.
