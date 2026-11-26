---
title: ENTITY_LAYOUT_DELETE_MODEL_CONTRACT
status: sprint
owner: configuration/platform model
raised_by: Access & Identity V2 — Option Sets + Layouts + Fields authority cleanup
---

# A DELETE that removes what the model calls immutable

`DELETE /api/admin/entity-layouts/[id]` was inside the bounded cluster for the authority cleanup and
was deliberately **excluded** from it. It is not an authorization gap. It is a contradiction between
two statements the same file makes.

## What the code says about itself

`web/app/api/admin/entity-layouts/[id]/route.ts`, header:

> Published rows are immutable (publish a new draft version instead).

The same file exports a `DELETE` that removes a row whatever its status, and the handler knows the
published case exists, because it compensates for it:

> Deleting a published Summary row changes which variant resolves — bust the `fps:` config read.

So the route does not merely contradict the doctrine in passing; it recognises the published case and
handles it. A published layout can be removed, and the resolution of which variant a tenant sees
changes as a result.

## Why no capability was created for it

The cleanup's job was to replace role titles with truthful capabilities. There is no truthful
capability for this operation while the model says the thing it deletes cannot be deleted. Minting
`layouts.delete` would have:

- made a contradiction look sanctioned, and
- made it *more* reachable, because a capability can be granted to a custom role whereas the current
  `ctx.role !== "admin"` gate cannot.

The route therefore keeps its role-title gate. That is deliberate: it is no more reachable today than
it was before this slice, and the authority census records it as unresolved rather than as migrated.

## What the owner needs to decide

1. **RETIRE** — if nothing legitimately calls it. Cheapest, if true.
2. **RESTRICT_TO_UNPUBLISHED** — allow deletion only of a draft that was never published, which is
   ordinary cleanup and consistent with the immutability doctrine. The compensating cache bust would
   then be unnecessary, which is itself a signal this is the intended shape.
3. **MODEL_CHANGE_REQUIRED** — if deleting published layout history is genuinely wanted, the
   append-only doctrine is what needs amending, and the deletion needs a capability and an audit
   story rather than a role literal.

Access & Identity can migrate the authority in an afternoon once the model says what the operation
is. It cannot decide what the operation should be.

## Evidence

- Route: `web/app/api/admin/entity-layouts/[id]/route.ts` (`DELETE`)
- Doctrine: the same file's header, and the prior finding that `entity_layouts` is an append-only
  version ledger with no archive state — republish, never edit or delete history
- Behaviour: deletes regardless of `status`; busts the `fps:` config read when `status === "published"`
- Current gate: `ctx.role !== "admin"` — unchanged by this slice
