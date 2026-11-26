---
owner: engineering
status: frozen
last_reviewed: 2026-07-21
sprint: org-runtime-realization
slot: 4
phase: organization-configuration-relationship-model
---

# Organization Configuration Relationship Model

**Purpose.** Freeze who owns what across Organization configuration so implementation stops oscillating. This is an implementation contract derived from current code, schema, accepted platform docs, and accepted runtime — not a redesign and not a new product.

**Non-goals.** No UI implementation, no route migration, no runtime redesign, no push/merge/PR/deploy.

**Grounding sources (primary).**

| Source | Role |
|--------|------|
| `web/lib/programs/publication/programPublicationModel.ts` | Program field policies |
| `POST /api/admin/configuration/programs` + LPC PATCH | Program publish / assign / Location override grain |
| `commercial_tuition_rates` + Financials chapters | Tuition rate authority |
| `web/lib/locations/locationConcernContract.ts` | Location concern registry |
| `docs/platform/core/configuration-ownership-and-inheritance.md` | Accepted ownership doctrine |
| `docs/platform/foundation/configuration-platform-expansion-constitution.md` | Domain publish / assignment / override posture |
| Prior audits: Programs & Locations IA; scope/inheritance convergence; Financials realization | IA already shipped |

---

## 1. Vocabulary (frozen)

| Term | Meaning in this model |
|------|------------------------|
| **Defined once** | Authoritative identity or defaults live at Organization (or a single SoR). Other surfaces reference; they do not recreate. |
| **Assigned** | A published / defined object is bound to a Location (or role/scope) so it becomes consumable there. Assignment ≠ copy of identity. |
| **Inherited** | A Location (or narrower scope) uses the Organization (or parent) value until an override exists. Value cascade. |
| **Overridden** | A Location (or narrower scope) stores a different value; clear restores inherit. Only claimed where storage + API already support it. |
| **Executed locally** | Runtime / operations resolve at Location (or room/enrollment). Config may be org-defined; execution still happens in local context. |

**Access is not inheritance.** Roles and scopes are **assigned**; they do not cascade config values org→location.

---

## 2. Domain ownership matrix

Legend for five questions: **Y** = proven in implementation; **N** = not supported / not claimed; **Partial** = limited grain only.

### 2.1 Programs

| Question | Answer |
|----------|--------|
| Defined once? | **Y** — Organization Program identity (`programs` + drafts/revisions) |
| Assigned? | **Y** — publish revision → assign → `location_program_categories` (`program_id` / `program_revision_id`) |
| Inherited? | **Partial** — availability / offered posture inherits as “use org definition until Location supplies offering”; not full field cascade |
| Overridden? | **Partial** — coarse LPC fields only (see field split below) |
| Executed locally? | **Y** — offering, capacity, schedule, enrollment consumption resolve at Location / room / runtime |

#### Organization Program identity

- One catalog entry per Program (key, label, category, eligibility, audience, resource type, qualifications, default policy/commercial posture).
- Lifecycle: `create_draft` → `update_draft` → `validate_draft` → `publish` → `assign`.
- **No** Location-created Program identity (`POST` LPC create → 409).

#### Location association / offering

- Association = assignment of a published revision to a Location (LPC row).
- Offering = Location-owned `offered` / active posture + local authorization evidence (`location_must_supply`).

#### Delivery Options

- Authored on the Organization Program (commercial/delivery posture on the Program definition).
- Financials **references** Delivery Options for Tuition/fees; Financials does **not** own Program identity.

#### Publication / Distribution / History

| Concern | Owner |
|---------|--------|
| Publication | Organization Programs (immutable revision) |
| Distribution | Organization assign → selected Locations |
| History | Program drafts/revisions + LPC linkage to `program_revision_id` |

#### Field split (implementation contract)

From `PROGRAM_CONFIGURATION_FIELDS`:

| Belongs to Organization Program | Belongs to Location | Shared / effective | Runtime-derived (not config edit) |
|---------------------------------|---------------------|--------------------|-----------------------------------|
| `programKey`, `label`, `category`, `eligibility`, `audience`, `requiredResourceType`, `qualificationRequirements`, `defaultPolicyRefs`, `defaultCommercialPosture` | `offered`, `localAuthorizationEvidence`; LPC: `is_active`, `metadata`, `local_authorization_evidence` | `description` — org default; Location **may** override via `local_description_override` | `assignedResources`, `capacity`, `scheduleAvailability` |

**Label** is organization-locked; LPC PATCH rejects label changes when published revision is linked.

---

### 2.2 Locations

| Question | Answer |
|----------|--------|
| Defined once? | **Y** — each site is a Location row (`location_type: site`); rooms are child units |
| Assigned? | **N** as catalog templates — sites are not “assigned from org catalog”; Programs/Access **are** assigned *to* Locations |
| Inherited? | **N** for site identity — Locations *are* the scope ladder leaf for many operational configs |
| Overridden? | **N** for site identity; **Y** for configs that inherit onto the site (Tuition, Program description, etc.) |
| Executed locally? | **Y** — rooms, schedule, capacity truth, tours, placement UI surface, local access scope |

#### Concern classification

| Concern | Classification | Notes |
|---------|----------------|-------|
| **Rooms** | Location-owned child units | Created as `locations` with `location_type: "unit"` + `parent_location_id`. **Not** org catalog. **Not** inherited. **Not** reusable org templates. |
| **Schedules** | Location-owned | `schedule_patterns` keyed by `site_location_id` |
| **Capacity** | Location/room metadata + scoped rules | Room `metadata.capacity`; operational rules (`childcare_capacity_rules`) resolve on org→site→program→room ladder. Programs do **not** own capacity. |
| **Tours** | Location-scoped rules | `tour_availability_rules` (`location_id`; org-wide null rules also loadable) |
| **Placement** | Business Process–owned ranking, **surfaced** on Location | Ranking lives on work-unit / process metadata — **not** a Location-scoped fork of BP definition |
| **Access (Location tab)** | Site-scope **assignment** on users | Not config inheritance |

#### Rooms — frozen answers

| Question | Answer |
|----------|--------|
| Organization-defined? | **No** |
| Location-owned? | **Yes** |
| Assignable (as org templates)? | **No** |
| Reusable across Locations? | **No** (each room is a site child row) |
| Inherited? | **n/a** — rooms *are* scope |

---

### 2.3 Tuition

| Question | Answer |
|----------|--------|
| Organization default? | **Y** — `commercial_tuition_rates.location_id` null |
| Location override? | **Y** — non-null `location_id`; clear restores inherit |
| Inherited? | **Y** — Location cells show Organization default until overridden |
| Assigned? | **N** as a separate assignment step — rates attach by Program / Delivery Option / cadence; Location scope is override grain |
| Executed? | Commercial/runtime resolution at enrollment / charge time (simulator previews) |

**Rate authority.** Financials (Commercial Config) owns Tuition rates. Programs own Delivery Options identity. Tuition **references** Programs; Programs pages must not own rate editors as SoR.

Vocabulary (frozen): **Organization default** · **Inherited** · **Location override**.

---

### 2.4 Financials

| Chapter | Owns? | Kind | Defined once | Assigned | Inherited | Overridden | Executed locally |
|---------|-------|------|--------------|----------|-----------|------------|------------------|
| **Tuition** | **Yes** | configuration | Org defaults | — | → Locations | Location rate cells | Charge / enrollment resolution |
| **Catalog / Fees** | **Yes** (`commercial_products`) | configuration | Org catalog | location/program scoping where supported | where supported | where supported | Billable execution |
| **Policies** | **Yes** (`commercial_policies`) | configuration | Org policies | — | doctrine: org→site→… | where API supports | Policy application |
| **Accounting** | **Yes** | configuration | Org mappings | — | N (org mapping) | N proven | Downstream GL use |
| **Simulator** | **Utility only** | utility | — | — | — | — | Preview only |
| **Funding** | **No — Processing boundary** | boundary | — | — | — | — | Who-pays elsewhere |
| **Programs** | **No** | — | — | — | — | — | Financials **consumes** Programs |

**Commercial naming.** Preserve storage/API under commercial tables; product surface is **Financials**. Do not preserve “Commercial” as an Organization peer. Do not invent Financials ownership of Programs because the old Commercial shell listed them.

---

### 2.5 Data Model

| Question | Answer |
|----------|--------|
| Defined once? | **Y** — entities, fields, statuses, calculations, option sets, relationships |
| Assigned? | **N** |
| Inherited? | **N** (platform→org doctrine; not org→location value cascade in product UI) |
| Overridden? | **N** at Location |
| Executed locally? | Runtime uses org vocabulary everywhere |

**Organization-only.** No Location Data Model editor. No Location field fork.

---

### 2.6 Business Processes

| Question | Answer |
|----------|--------|
| Organization definition? | **Y** — process / stages / actions authored centrally |
| Location activation? | **Partial** — availability / lifecycle activation (assignment-style), not a forked process graph |
| Location override? | **N — unproven; do not claim** |
| Executed locally? | **Y** — work units / records execute in operational context |

---

### 2.7 Surfaces

| Question | Answer |
|----------|--------|
| Organization definition? | **Y** — Focus Panels, queues, workspaces, work units |
| Publication? | **Y** — Surfaces publish APIs |
| Assignment? | **Partial** — process/workspace binding where already wired |
| Override? | **N — unproven / constitution forbids Location Surfaces fork** |
| Executed locally? | **Y** — operators use published surfaces in context |

---

### 2.8 Access

| Question | Answer |
|----------|--------|
| Defined once? | **Partial** — roles / permission keys authored at Organization |
| Assigned? | **Y** — users bound to roles + location/department scopes |
| Inherited? | **N** — not a value cascade |
| Overridden? | **N** — scopes replace or add assignment; they do not “override inherited permissions” as Tuition does |
| Executed locally? | **Y** — authorization checks at request time with assigned scopes |

**Why Access is not inheritance.** Inheritance answers “what value do I use?” Access answers “who may act / see?” Permission keys are **granted**; site/department scopes are **assigned**. Framing Access with org→location inherit vocabulary causes IA drift (false Continuity with Tuition).

---

## 3. Cross-domain dependency diagram

Edges mean **consumes / depends on** (not UI nesting).

```text
Programs ──────────────────────────────► Enrollment / Records
    │
    ├──► Locations (assignment / offering)
    │         │
    │         ├──► Rooms (Location-owned delivery units)
    │         │         └──► Schedules / Capacity (operational truth)
    │         ├──► Tours (Location-scoped rules)
    │         └──► Access (site-scope assignment on users)
    │
    └──► Financials
              ├──► Tuition (rates on Delivery Options / Program refs)
              ├──► Catalog / Fees / Policies / Accounting
              └──► Simulator (preview utility)
                    Funding ── boundary → Processing (not Financials SoR)

Business Processes ──► Placement ranking (surfaced on Location; BP-owned)
Business Processes ──► Surfaces (binding / publication where wired)
Data Model ──► all domains (shared vocabulary; org-only authoring)
Access ──► all domains (authorization; assignment, not inheritance)
```

**Consumer summary**

| Domain | Consumes |
|--------|----------|
| Locations | Programs (offering), Access (site scope), BP (placement surface) |
| Rooms / Schedules / Capacity | Locations |
| Financials / Tuition | Programs (refs), Locations (override scope) |
| Enrollment | Programs, Locations, Financials resolution |
| Surfaces | Business Processes / workspaces (binding) |
| All config UIs | Data Model + Access |

---

## 4. Organization navigation — Object Collection vs Configuration Hub

| Peer / surface | Classification | Pattern |
|----------------|----------------|---------|
| **Programs & Locations** | **Configuration Hub** (relationship) | landing → launch tiles → existing tools |
| **Programs** (`/organization/programs`) | **Object Collection** | collection → selected Program → detail |
| **Locations** (`/organization/locations`) | **Object Collection** | collection → selected Location → concern tabs |
| **Financials** | **Configuration Hub** | landing → `?chapter=` → existing commercial tools |
| **Data Model** | **Configuration Hub** | landing → section settings routes |
| **Access** | **Configuration Hub** | landing → users / roles / departments |
| **Business Processes** | **Configuration Hub** | landing → processes / stages / actions / … |
| **Surfaces** | **Configuration Hub** | landing → Focus Panels / queues / … |
| **Communications / Automation / Operational Intelligence** | **Configuration Hub** (unchanged peer posture) | landing → tools |

**Mandatory distinction.** Object Collections must not be flattened into hub tiles without a collection. Hubs must not invent a fake collection when the SoR is a set of launch surfaces.

**Programs & Locations decision (reaffirmed).** One peer hub; two preserved collections; no merged Programs+Locations workspace; Financials does not own Programs.

**Financials decision (reaffirmed).** Hub owns Tuition, Catalog, Policies, Accounting; Simulator = utility; Funding = Processing boundary; Programs = referenced only.

---

## 5. Mockup pack updates (annotation only)

Existing pack: `docs/audits/active/assets/organization-financials-mockups-2026-07.html`

Ownership annotations applied (no page redesign):

1. **M1 Organization nav** — Programs standalone peer **superseded**: peer is **Programs & Locations** (hub); Programs/Locations remain collections under it.
2. **Tuition cells** — annotate **Organization default / Inherited / Location override / Executed at charge time**.
3. **Financials tiles** — annotate **owns** vs **boundary** vs **utility**; Programs “managed in Programs ↗”.
4. Companion annotation sheet: `docs/audits/active/assets/organization-configuration-ownership-annotations-2026-07.html`

---

## 6. Implementation sequence (do not implement in this sprint)

Recommended order after this freeze — evidence-driven, minimizes rework:

1. **Programs & Locations IA** — relationship hub + preserved collections *(done on this branch)*.
2. **Programs assignment flow** — Location in-context assign/create via configuration Programs API *(largely done)*.
3. **Programs ownership UX** — badges, Location-only mutation scope, description restore *(largely done)*.
4. **Tuition inheritance** — vocabulary + Continuity under Financials; Compare/override clear *(largely done; harden gaps only)*.
5. **Rooms ownership** — keep Location-owned; no org room catalog; UI copy must not imply Program-owned rooms.
6. **Financials pages** — chapter landings already; finish chapter polish without reopening Programs ownership.
7. **Business Processes** — hub landing → existing tools; **do not** build Location process override.
8. **Surfaces** — hub landing → publish/bind tools; **do not** build Location Surfaces fork.
9. **Data Model** — hub landing; keep Organization-only.
10. **Access** — hub landing; keep assignment framing; never Tuition-style inherit UI.

Adjust only if new **code evidence** appears — not mockups.

---

## 7. Remaining unresolved questions

These are **explicitly open**; do not invent answers in UI:

1. **Financial policies / catalog Location override grain** — doctrine allows org→site cascade; confirm per-API which product/policy fields already store Location overrides vs org-only today.
2. **Business Process “activation” UX** — department lifecycle activation exists; Location-specific availability UI for processes is not a proven product surface — leave as assignment-style until an API owns it.
3. **Surfaces assignment completeness** — which surface types bind to which processes/workspaces in production vs stub.
4. **Placement on Location tab** — keep BP-owned ranking with Location surface, or later move editor exclusively under BP hub (product preference; authority already BP).
5. **Behind `origin/staging`** — this worktree may need rebase/promotion later; ownership freeze does not depend on merge.

---

## 8. Freeze statement

This document is the Organization Configuration Relationship Model for implementation. Domains may gain UI polish only within these ownership, assignment, inheritance, override, and execution boundaries. New capabilities require a new evidence-backed amendment — not mockup-driven IA drift.

## 9. Post–Assignment certification strategy (Stage 2.5)

After Programs Assignment is wired (Stage 3), Organization work should not invent page-local engines.

For each Organization surface ask:

1. Object Collection or Configuration Hub?
2. Needs **Configuration Assignment** (availability)?
3. Needs **Configuration Continuity**?
4. Supports **local overrides** (value kind)?
5. Requires **Preview → Review → Commit**?

Certified kinds: Assignment · Value inherit/override · Authorization assignment · Surface/process binding · Preview→Commit.

Canonical certification: `docs/audits/active/configuration-assignment-capability-certification-2026-07.md`.

ORGANIZATION CONFIGURATION RELATIONSHIP MODEL READY — ownership, assignment, inheritance, override, and execution boundaries are frozen and implementation can continue without further IA drift.
