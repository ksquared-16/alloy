---
title: PLATFORM_FIELD_AUTHORITY_DELEGABILITY
status: sprint
owner: platform field/catalog model
raised_by: Access & Identity V2 — Option Sets + Layouts + Fields authority cleanup
---

# May an organization delegate the power to install something it can never remove?

`POST /api/admin/field-definitions/ensure-platform-field` was inside the bounded cluster and was
**excluded** pending a product decision. The authorising instruction asked for a delegability check
before making a platform-maintenance operation customer-configurable, and said not to guess. This is
the check, and the answer is not obviously yes.

## What the operation does

It upserts a `field_definitions` row from a platform catalog template into the caller's own
organization, with **`is_system: true`**.

## Why that matters

`is_system` is a one-way door. In `web/app/api/admin/field-definitions/[id]/route.ts`:

- `DELETE` refuses outright: *"Cannot delete a system field definition"* (400).
- `PATCH` freezes identity: `FORBIDDEN_FOR_SYSTEM = ["org_id", "entity_type", "field_key",
  "field_type", "is_system"]`.

So an organization that installs a platform field can never remove it and never change what it is.
Every other capability in this slice governs something the organization can undo.

## The question for the owner

Today the operation is reachable by any organization administrator via `ctx.role !== "admin"`, so the
*ability* is already delegated to a job title. The open question is narrower and sharper:

> Should `fields.platform.manage` be grantable to an arbitrary custom role through
> `/organization/access`, such that an organization can hand out the power to mint permanent,
> unremovable platform-owned rows in its own tenant?

Arguments both ways are real. It is org-scoped and the templates are a fixed platform catalog, which
argues for ordinary delegation. It is irreversible and marks rows the platform claims to own, which
argues that it belongs to platform maintenance rather than tenant configuration.

There is no existing doctrine to settle it: nothing in `lib/access` distinguishes platform-owned
authority from organizational authority today.

## Disposition

The route keeps its role-title gate. No capability was minted, so nothing became more reachable, and
the authority census records it as unresolved rather than as migrated.

If the answer is **yes, delegable**: mint `fields.platform.manage`, grant it to `admin` for
compatibility, withhold from `ops`, and the route conversion is a ten-line change.

If the answer is **no**: the operation needs a platform-authority concept that the capability model
does not currently have, and that is a larger design than an authority cleanup should invent.
