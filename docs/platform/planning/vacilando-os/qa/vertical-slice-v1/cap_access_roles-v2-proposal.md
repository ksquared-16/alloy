# Access & Roles V2 — Implementation Proposal

- **Capability:** `cap_access_roles`
- **Mission:** `msn_a47b9aded72c70955f` · **Package:** `pkg_92244e354b6d2d7020` (v1)
- **Status:** Planning proposal only — **no source code changes.** V2 is not implemented by this mission.
- **Current implementation under analysis:** `web/app/adminV2/settings/users-roles/UsersRolesSettingsClient.tsx`

## Governing constraints (inherited — do not violate)

These are load-bearing product decisions carried into V2. Every proposed change below is checked against them.

- **[ad1]** Roles are the unit of permission grant. Users receive capability access **via roles, never directly.**
- **[ad2]** Permission taxonomy is **capability-scoped** — one coherent permission set per capability.
- **[rp1] REJECTED — per-user direct permission grants.** V2 must not introduce any path that grants a permission to a user outside of a role. Ungovernable at scale.
- **[rp2] REJECTED — a single global admin flag in place of granular capability permissions.** The whole point of the V2 delta is to make coarse grants finer, not to re-collapse them.

Both roadmap-critical V2 features below (granular permissions, templates+inheritance) are motivated *by* `rp2` and constrained *by* `rp1`: everything stays role-mediated and capability-scoped.

---

## 1. Current-State Analysis

### 1.1 What exists today

The Access & Roles surface is a single client component (`UsersRolesSettingsClient.tsx`) with two tabs — **Users** and **Roles** — gated on `canManageUsersRoles` (org admin, or the `settings.users_roles` permission). It composes four data domains served by REST routes under `web/app/api/admin/`:

| Concern | Storage | Route | Notes |
|---|---|---|---|
| Role definitions | `role_definitions` (per-org: `role_key`, `role_label`, `is_system`, `is_active`) | `GET/POST /api/admin/rbac/roles`, `PATCH /api/admin/rbac/roles/[role_key]` | System roles are un-deactivatable; defaults merged in via `mergeRoleDefinitionsWithDefaults`. |
| Permission catalog | `permissions` + `permission_keys` + `permission_definitions` (triple-written; dual FK on `permission_key`) | `GET /api/admin/rbac/permissions` | Org-agnostic catalog seeded by migration `20260505164000_permission_grid_keys.sql`. |
| Role → permission grants | `role_permission_grants` (`org_id`, `role_key`, `permission_key`, `allowed`) | `GET/PUT /api/admin/rbac/grants?role_key=…` | **Destructive full-replace** on save (delete-all-then-insert). |
| User → role + data scope | `user_roles` (one primary role per user/org) + `access-scope` (dept/site) | `PATCH /api/admin/users/[id]/role`, `.../access-scope` | Access scope is *data visibility* (department/site), orthogonal to *capability* grants. |

The permission editor is a **capability × level grid** (`web/lib/admin/permissionGrid.ts`): ten capability areas (Opportunities, Customers, Communications, Scheduling, Billing, Documents, Reports, Configuration, Users & Roles, Workflows), each collapsed to one of three levels — **No access / Read / Write-Manage**. The grid maps each level to a small fixed set of `permission_key`s (`readKeys`, `writeKeys`), and Write implies Read in the UI.

### 1.2 What is genuinely good (preserve in V2)

- **`rp1` is already honored structurally.** There is no code path that writes a permission to a user. Grants live only on roles; users only ever reference a `role_key`. V2 inherits this cleanly.
- **`ad2` is already honored.** Permissions are namespaced by capability (`crm.*`, `billing.*`, `scheduling.*`, …) and grouped by `group_key`. The taxonomy is capability-scoped today.
- **Catalog vs. grant separation is correct.** The permission *catalog* is org-agnostic; only *grants* are per-org. V2 keeps this seam.
- **Server-side validation of grant keys.** The `PUT /grants` route rejects any key not present-and-active in `permission_definitions` before writing — a good integrity gate to retain.

### 1.3 The three gaps this proposal closes

1. **Granularity is capped at 3 levels per capability (partial `rp2` residue).** The grid deliberately hides the real taxonomy: a capability may define many operations (e.g. billing: view / issue-invoice / refund / adjust-ledger / export), but the operator can only choose Read or Write for the *whole* capability. This is coarser than `ad2` allows and is effectively a per-capability "admin flag." It is the softened, per-area version of exactly what `rp2` rejects globally.
2. **No role composition — every role is authored flat.** There are no **role templates** (a starting-point permission set) and no **inheritance** (a role that extends another). Standing up a new "Site Manager (limited)" means hand-toggling the entire grid, and org-wide policy changes must be re-applied to every role by hand. This makes granular permissions *unusable at scale* if shipped alone — which is why items 1 and 2 must ship together.
3. **No audit trail — permission changes are unattributable and destructive.** `PUT /grants` deletes every grant for the role and re-inserts. There is no record of who changed what, when, or the before/after. For an access-control surface this is the single highest-risk gap: a privilege escalation is invisible after the fact.

---

## 2. V2 Scope

V2 delivers the three roadmap items as **one coherent slice**, because they are interdependent: granular permissions are unmanageable without templates+inheritance, and both raise the blast radius of a mistake, which makes the audit trail non-optional.

### 2.1 Granular per-capability permissions

- **Replace the fixed 3-level grid with the capability's real permission set**, rendered per capability group. The grid becomes a *convenience preset* ("Read", "Write/Manage", "Full") layered **on top of** individually-selectable `permission_key` checkboxes — the presets stay for fast common cases; the granular list is what actually gets stored.
- **The taxonomy is owned by each capability, not by this screen.** Access & Roles renders whatever `permission_definitions` (grouped by `group_key`) the catalog exposes for a capability. Adding a new fine-grained permission is a catalog change (migration/seed), and it appears here automatically — no edit to this component. This keeps `ad2` (capability-scoped taxonomy) intact and avoids re-hardcoding a level map.
- **Preset ↔ granular reconciliation:** when a role's granted keys don't match any preset exactly, the UI shows "Custom" for that capability rather than silently snapping to Read/Write (today's `levelFromGrantedKeys` collapses information — V2 must preserve it).
- **Explicitly still role-only (`rp1`):** granularity is added *within a role's grant set*, never as a user-level override. No new user→permission path is introduced.

### 2.2 Role templates + inheritance

Two distinct mechanisms, deliberately separated:

- **Templates (copy-at-create, no live link).** A template is a named, versioned permission preset (e.g. "Front Desk", "Site Manager", "Billing Clerk"). Creating a role *from* a template seeds its grants; thereafter the role is independent. Templates make granular permissions tractable to author. Templates are catalog-level (org-agnostic defaults) but an org may save its own.
- **Inheritance (live parent link).** A role may declare a single `parent_role_key`. Its **effective grants = union(parent effective grants, own grants)**. Own grants may only *add* to the parent, never subtract — subtractive inheritance is explicitly out of scope for V2 (it makes effective-permission reasoning non-monotonic and audit-hostile). Inheritance is a DAG with a hard depth cap and cycle rejection.
- **Guardrails against `rp2` regression:** a role that inherits from a broad parent is still expressed as a granular, inspectable set — the UI always shows the *resolved effective permissions*, so inheritance never becomes a hidden "make-admin" switch.
- **System roles** remain un-deletable and their *identity* is fixed, but V2 may allow them to serve as inheritance parents.

### 2.3 Audit trail for permission changes

- **Append-only audit log** capturing every mutation to roles, grants, template application, inheritance edges, and user→role assignments: `who` (actor user id), `when`, `org_id`, `subject` (role_key / permission_key / user_id), `action`, and **before/after** snapshots.
- **Stop destroying history on grant save.** The `PUT /grants` delete-then-insert becomes a **diff** (compute added/removed keys, apply, and write one audit row per change set with the full before/after). The destructive replace is what makes the current design unauditable; V2 removes it.
- **Read surface:** a per-role and org-wide "Change history" view (who granted `billing.refund` to "Site Manager", when, and what it was before). Filterable by actor, subject, capability, and date.
- Audit writes are **best-effort-blocking**: if the audit insert fails, the permission mutation is rejected (fail-closed), so we never have an unlogged privilege change.

### 2.4 Out of scope for V2 (named to prevent scope creep)

- Per-user direct permission grants of any kind (**`rp1`** — permanently rejected, not "later").
- A global super-admin flag replacing granular permissions (**`rp2`**).
- Subtractive / deny-override inheritance.
- Time-boxed or just-in-time elevation (candidate for V3).
- Cross-org / global role sharing beyond seeded catalog templates.

---

## 3. Data Model Changes

All changes are **additive**; no existing column is dropped, preserving rollback. New tables/columns are per-org where they carry grants, org-agnostic where they carry catalog.

### 3.1 New / changed tables

```
role_definitions                         (EXISTING — add columns)
  + parent_role_key   text NULL          -- inheritance edge; FK (org_id, parent_role_key) → role_definitions
  + template_key      text NULL          -- provenance: template this role was seeded from (informational)
  -- CHECK: parent_role_key <> role_key  (no self-parent; deep-cycle enforced in app + trigger)

role_templates                           (NEW — catalog, org-agnostic + optional per-org)
  template_key        text  PK-part
  org_id              uuid  NULL          -- NULL = global seeded template; non-null = org-authored
  label               text
  description         text NULL
  version             int   NOT NULL DEFAULT 1
  is_active           bool  NOT NULL DEFAULT true

role_template_grants                      (NEW — permission set a template seeds)
  template_key        text  → role_templates
  org_id              uuid  NULL
  permission_key      text  → permission_definitions(key)   -- same integrity FK as grants use today

role_permission_grants                    (EXISTING — unchanged shape; write path changes, see §3.3)
  (org_id, role_key, permission_key, allowed)

access_audit_log                          (NEW — append-only)
  id                  uuid  PK
  org_id              uuid  NOT NULL
  actor_user_id       uuid  NOT NULL      -- resolved from the authed session, never client-supplied
  occurred_at         timestamptz NOT NULL DEFAULT now()
  action              text  NOT NULL      -- grant.add | grant.remove | role.create | role.update |
                                          -- role.template_apply | role.inherit_set | user.role_assign
  subject_type        text  NOT NULL      -- 'role' | 'permission' | 'user' | 'template' | 'inheritance'
  subject_id          text  NOT NULL      -- role_key / permission_key / user_id / template_key
  before_state        jsonb NULL
  after_state         jsonb NULL
  request_id          text  NULL          -- correlate multi-row change sets from one save
  -- INDEX (org_id, occurred_at DESC), (org_id, subject_type, subject_id)
  -- No UPDATE/DELETE grant to app role — append-only enforced by RLS/policy.
```

### 3.2 Effective-permission resolution (new read model)

Introduce a single server-side resolver — `resolveEffectiveGrants(org_id, role_key)` — that walks the inheritance chain and returns the **union** of own + inherited grants. This becomes the *only* source of truth for "what can this role do," used by both the editor (to render the resolved set) and by enforcement. Own grants stored in `role_permission_grants` remain the editable layer; inherited grants are computed, never copied (so a parent change propagates).

- Depth cap (e.g. ≤ 5) and cycle detection enforced both in app and via a DB trigger on `parent_role_key` writes.
- Caching keyed by `(org_id, role_key, max(updated_at) across chain)` to keep enforcement cheap.

### 3.3 Write-path change (audit-safe grant save)

`PUT /api/admin/rbac/grants` changes from *replace* to *diff-and-log* within a transaction:

1. Load current granted keys for `(org_id, role_key)`.
2. Compute `added = new − current`, `removed = current − new`.
3. Validate `new` against active `permission_definitions` (retain existing gate).
4. Apply only the delta (insert `added`, delete `removed`).
5. Write one `access_audit_log` row per change (or one batched row with a `request_id` and full before/after in `jsonb`).
6. Commit atomically; if the audit write fails, roll back the whole transaction (fail-closed).

No table is renamed; the route's contract (`{ permission_keys: string[] }` in, `{ ok: true }` out) is unchanged, so the client keeps working during rollout.

---

## 4. Acceptance Criteria

- **[AC-V2-1] Granular grants persist.** An operator can grant an individual capability permission (a single `permission_key`, not just a Read/Write level) and it is stored in `role_permission_grants` and reflected on reload.
- **[AC-V2-2] Presets remain, granular is authoritative.** Selecting a preset (Read/Write/Full) sets the corresponding keys; hand-editing keys away from a preset shows "Custom" and does not lose information on save/reload.
- **[AC-V2-3] Templates seed roles.** Creating a role from a template produces exactly the template's permission set at that template version; the new role is thereafter independent of the template.
- **[AC-V2-4] Inheritance resolves as union and propagates.** A child role's effective permissions equal `union(parent, own)`; adding a grant to the parent adds it to the child's effective set without editing the child.
- **[AC-V2-5] Cycles and depth are rejected.** Attempting to create an inheritance cycle or exceed the depth cap is rejected by both the API and the DB, with a clear error.
- **[AC-V2-6] Every permission change is audited.** Each grant add/remove, role create/update, template apply, inheritance edit, and user→role assignment writes an `access_audit_log` row with actor, timestamp, subject, and before/after.
- **[AC-V2-7] Fail-closed auditing.** If the audit write fails, the permission mutation is rejected and no partial change persists.
- **[AC-V2-8] Change history is viewable.** An operator can view, per role and org-wide, the ordered history of permission changes with actor and before/after.
- **[AC-V2-9] `rp1` upheld.** No API or UI path grants a permission to a user directly; all capability access remains role-mediated. (Verified by test: there is no user→permission write.)
- **[AC-V2-10] `rp2` upheld.** No global admin flag is introduced; broad access is always expressed as an inspectable, granular, resolved permission set.
- **[AC-V2-11] Backward compatible.** Existing roles, grants, and the `GET/PUT /grants` contract continue to function unchanged after migration.

---

## 5. QA Plan

### 5.1 Automated

- **Resolver unit tests:** union correctness, parent propagation, depth cap, cycle rejection, and cache invalidation on parent change.
- **Grant diff-and-log tests:** given current + new key sets, assert only the delta is written and the exact audit rows (added/removed, before/after) are produced; assert transactional rollback when the audit insert is forced to fail (**AC-V2-7**).
- **Preset ↔ granular tests** on an extended `permissionGrid`: `levelFromGrantedKeys` must return "Custom" for non-matching sets and round-trip without loss (**AC-V2-2**).
- **Invariant tests for `rp1`/`rp2`:** grep-level + integration assertion that no route writes to a user→permission mapping, and that no boolean "is_super_admin"-style grant exists (**AC-V2-9, AC-V2-10**).
- **Migration test:** apply additive migration to a copy with existing roles/grants; assert all pre-existing grants resolve identically (**AC-V2-11**).

### 5.2 Manual / operator walkthrough (screenshots into this `qa/vertical-slice-v1/` folder)

1. Grant a single fine-grained permission (e.g. `billing.refund`) to a role, reload, confirm it persists and shows "Custom."
2. Create a role from the "Site Manager" template; confirm seeded grants.
3. Set that role's parent to a broader role; confirm the child's effective grid shows inherited keys as inherited (visually distinct) and own keys as editable.
4. Add a grant to the parent; confirm the child gains it without editing the child.
5. Attempt a cycle; confirm rejection.
6. Open the role's Change history; confirm the actor, timestamp, and before/after for each of the above actions.

### 5.3 Security review

- Confirm audit `actor_user_id` is server-derived from the session, never client-supplied.
- Confirm `access_audit_log` is append-only to the app role (no UPDATE/DELETE).
- Confirm grant validation still rejects unknown/inactive `permission_key`s (retained gate).
- Confirm the existing auth gate (`requireUsersRolesManageAuth`) protects every new mutating route.

---

## 6. Rollout

Phased, additive, reversible. Each phase is independently shippable and behind a flag where it changes operator-visible behavior.

- **Phase 0 — Migrations (no behavior change).** Add `access_audit_log`, `role_templates`, `role_template_grants`, and the `role_definitions` columns. All nullable/additive; existing code untouched.
- **Phase 1 — Audit the existing write path.** Convert `PUT /grants` to diff-and-log (§3.3) and add user→role assignment logging. No UI change yet — this is pure risk reduction and can ship first. Gains **AC-V2-6/7** immediately for today's coarse grants.
- **Phase 2 — Effective-permission resolver + inheritance.** Land `resolveEffectiveGrants`, `parent_role_key` editing, cycle/depth guards. Enforcement reads from the resolver. Feature-flag the inheritance editor UI.
- **Phase 3 — Granular editor + presets.** Extend the grid to render the full capability taxonomy with presets layered on top; ship the "Custom" state. Flagged rollout, then default-on.
- **Phase 4 — Templates + Change-history UI.** Template picker on role create; per-role and org-wide history view.
- **Rollback:** each phase is flag-gated; migrations are additive so a code rollback leaves the schema harmless. The `GET/PUT /grants` contract is preserved throughout, so an old client and a new server (or vice versa) interoperate during deploys.

**Sequencing rationale:** audit first (highest risk, lowest surface), then the resolver (foundation for both granularity and inheritance), then the operator-facing granular/template UX. Granular permissions never ship *before* templates+inheritance are available to manage them at scale — that ordering is what keeps `rp2` from creeping back in as per-role toggle fatigue.

---

## 7. Open Questions

Assumptions made in this proposal, pending operator confirmation:

- **Single-parent inheritance is sufficient.** Assumed one `parent_role_key` (single inheritance), not multi-parent. Multi-parent raises resolution and audit complexity — flagged if the org needs it.
- **Additive-only inheritance.** Assumed own grants may only *add* to a parent, never subtract (§2.2). If deny-overrides are required, that is a larger V2.x design.
- **Capability taxonomy source.** Assumed the fine-grained per-capability permission list comes from the existing `permission_definitions` catalog (grouped by `group_key`), extended per capability by migration — not owned by this screen. Confirm no separate taxonomy authority exists.
- **Templates are copy-at-create, not live-linked.** Assumed a role created from a template is thereafter independent (no propagation from template edits); inheritance is the live-link mechanism instead.
- **Audit retention is unbounded / policy-TBD.** Assumed `access_audit_log` is append-only with no retention/purge policy defined yet; retention window and export needs are open.
- **Fail-closed auditing is acceptable.** Assumed rejecting a permission change when the audit write fails (§2.3) is the desired trade-off over allowing an unlogged change.
- **One primary role per user is unchanged.** Assumed V2 keeps the current single-primary-role model for users; multi-role assignment is out of scope unless requested.

## Appendix A — Traceability

| Requirement | Addressed by |
|---|---|
| V2: granular per-capability permissions | §2.1, §3 (taxonomy render), AC-V2-1/2, QA 5.1 preset tests |
| V2: role templates + inheritance | §2.2, §3.1 (`role_templates`, `parent_role_key`), §3.2 resolver, AC-V2-3/4/5, QA 5.2 walkthrough |
| V2: audit trail for permission changes | §2.3, §3.1 (`access_audit_log`), §3.3 diff-and-log, AC-V2-6/7/8, QA 5.1 + 5.3 |
| `ad1` roles are the unit of grant | Preserved throughout; users only reference `role_key` |
| `ad2` capability-scoped taxonomy | §2.1 (capability owns its taxonomy), §3 catalog seam |
| `rp1` no per-user grants | §2.4, AC-V2-9, QA 5.1 invariant test |
| `rp2` no global admin flag | §1.3(1), §2.2 guardrails, AC-V2-10, sequencing rationale in §6 |
