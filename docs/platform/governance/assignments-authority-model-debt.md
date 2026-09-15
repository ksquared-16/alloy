# ASSIGNMENTS_AUTHORITY_MODEL_DEBT

**Status:** `BLOCKED_DECISION` — open, bounded, and deliberately not closed by the Communications lock.
**Raised:** 2026-09-15, by Communications Authority Coverage V1.
**Owner of the decision:** Director. This is not an engineering choice.

## What is unresolved

Who may decide that a piece of work belongs to a particular person.

The Communications authority model gave that surface five capabilities and gated 48 of its 49 admin
handlers on one of them. The 49th is
`POST /api/admin/communications/conversations/[id]/assign` — claim, assign, reassign, unassign,
route — and it still calls `requireAdminOrOps()`, which resolves portal admission and nothing else.

Its authority is therefore **unresolved, not enforced**. That is stated plainly here and in the
route's own header rather than dressed up as a decision, because an acknowledged unfinished mutation
is a different thing from an unknown one.

## Why it was excluded rather than gated

Assignment is not a Communications authority. It decides ownership of work, and the *same* question
governs at least four surfaces that do not share a capability vocabulary:

| Surface | The same question |
|---|---|
| Communications | who owns this conversation |
| Work items | who owns this work item |
| Cases / Processing | who owns this case |
| Jobs / Scheduling | who is assigned this job |

Two bad answers were available and both were rejected:

- **Invent `communications.assign`.** Settles a platform-wide model as a side effect of a
  Communications slice, and settles it in the one place least able to see the other three surfaces.
  The next surface then either copies a key that does not fit or invents a second, and the product
  acquires four incompatible assignment models by accretion — which is how Communications came to
  have five powers and two keys in the first place.
- **Fold it into `communications.send`.** Says an operator who may answer a family may also decide
  who answers every family. Those are different powers; the model exists because they are.

The doctrine this follows: *a role-title site is preferable to a falsely delegated capability if the
authority model is unresolved.* An honest `requireAdminOrOps()` that the lock names and the
certification asserts is safer than a confident capability that encodes the wrong model everywhere.

## What bounds the exposure meanwhile

1. **It is dark.** The handler's first statement is
   `if (!isCommsV2FlagEnabled("comms_v2_assignment")) return 404`. `comms_v2_assignment` is a
   NON-CORE flag, so it defaults **off** and is unset in every environment. Mounted certification
   asserts this directly: the persona holding all five Communications capabilities receives 404.
2. **It cannot send and cannot alter a message.** It writes assignment fields on
   `communication_threads` and one immutable `conversation_assignment_events` row.
3. **It is named, not overlooked.** `tests/access/communicationsAuthorityLock.test.ts` carries it as
   the single `BLOCKED_DECISION` exemption, with evidence: the exemption stops applying if either the
   debt marker or the flag check leaves the file. It cannot be quietly widened and cannot be
   forgotten.

## What would close it

A Director decision on one question: **is assignment one authority across the platform, or one per
surface?** Everything else follows mechanically.

- **One authority.** A single key — `work.assign`, say — enforced identically by Communications,
  Work Items, Processing and Scheduling. Cheapest to reason about; requires the four surfaces to
  agree that "assign" means the same act everywhere.
- **One per surface.** Four keys. Honest if the surfaces genuinely differ (routing a conversation to
  a team is arguably not the same act as scheduling a technician), and more work to keep coherent.

Either answer is implementable. What cannot be done is to let the answer be set by whichever lane
happens to touch an assignment route next — which is precisely what excluding this route prevents.

## Do not

- Do not gate this route on a Communications capability to make the lock's exemption list shorter.
  The exemption is the honest record; a wrong gate is not an improvement on it.
- Do not enable `comms_v2_assignment` in any environment before the decision is made. The flag is
  the only thing currently standing between this handler and any principal who can enter the portal.
