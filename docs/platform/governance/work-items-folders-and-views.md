# Work Items — folders, views, waiting, due state, assignment

The product decisions this workspace has to settle, and what the runtime actually does today.

## 1. Folder vs View

| | Folder | View |
|---|---|---|
| What it is | Operator organization — where someone PUT the work | A query lens over everything |
| Membership | Durable, chosen | Computed every render |
| Two operators | May differ | Identical for the same data |

**Work Items has no folders today.** Every entry that was labelled one is a query:

- `inbox` filtered to open work assigned to the current user — byte-for-byte the "Assigned to me"
  view under a second name.
- `projects` matched no process group and returned `[]` on every render. It was a permanently empty
  folder shipped in the rail.
- `enrollment` / `compliance` match a process group by **substring of its label**
  (`label.toLowerCase().includes("enrollment")`), so renaming a business process silently empties
  the lens.

The first two are removed. The remaining two are presented as **Processes**, which is what they are.

### User-created folders — specification

Durable membership needs storage, and none exists:

- `operational_tasks.metadata jsonb` could carry `folder_id` for MANUAL work.
- Projected work (Communications, Processing) has **no row to write to** — the projection is
  virtual by doctrine, and creating a row to hold a folder id would create exactly the duplicate
  operational truth Work Items is forbidden to create.

So the model is:

- A folder holds **manual work only**. Its membership lives on the work item.
- Projected work is organized by **saved views** (source + process + due lens), never by moving it.
  A projection cannot be moved, because moving it would mean owning it.
- Folder definitions (name, owner, order) need a table; the schema decision is not made here.

Until that ships, the rail must not offer a "+ New folder" affordance. An affordance that cannot
persist is worse than an absent one.

## 2. Completion authority

| Source | Completion authority | Enforced by |
|---|---|---|
| Manual | Work Items | `resolveWorkItemCompletionAuthority` → `work_items` |
| Business Process | Current Work / BP | → `current_work` |
| Processing | Processing | → `processing` |
| Communications | Communications | → `communications` |

Verified against the implementation. Business Process work and Work Items share **one**
`operational_tasks` row — Work Items projects the same row Current Work executes, so completing it
in Current Work makes it leave the Work Items queue because it is the same work, not a copy. The
detail surface routes to the owning runtime and never writes a second completion.

## 3. Waiting — what it means today: nothing

`filterTasksByView` returns `[]` for `waiting`, unconditionally.

There is no waiting state in the model. `operational_tasks` has no such column, and
`WorkItemDraftV1.waiting_on` is draft-only — `draftToOperationalTaskBody` drops it.

**Decision: Waiting is a DERIVED category, never a new generic state.** Introducing a Work
Items–owned waiting flag would let this workspace overrule a domain about whether its own work is
blocked, which is precisely the authority inversion the convergence exists to prevent.

Until a domain-authoritative blocked signal exists, `waiting` is not promoted in the rail: a lens
that can only ever be empty teaches operators that nothing is ever waiting. It remains reachable so
the Queue Operational Health vocabulary (Assigned / Waiting / Due Soon / Overdue) stays intact.

## 4. Due state — one derivation

`resolveWorkItemDetailState` is the single derivation: `completed` (or canceled) → `overdue`
(due < now) → `due_today` (due ≤ end of local today) → `open`. Every Work Items surface that renders
urgency comes through it, so a KPI tile, a process count, a queue filter and the detail panel cannot
disagree about the same row.

**Only a source that owns a due commitment may contribute to a due metric.** `due_at` is not the
same fact across the federated queue: Communications derives it from last activity (every comms item
would be overdue the instant it exists) and Processing from `statusChangedAt + 1 day`. Both are
excluded from due lenses by `hasAuthoritativeDueCommitment`. This is why the unified queue once read
**Overdue 9** beside a KPI strip reading **Overdue 1**.

## 5. Assignment — "Assigned to me" per source

Assignment is read from the domain-authoritative field and is **never inferred from sender or
recipient identity**. A family messaging an operator does not assign that operator the work; a
conversation is assigned in Communications (`assigned_user_id`), a case in Processing, and manual
and Business Process work through `operational_tasks.assigned_to_user_id`.

## 6. Known gap

The process lenses bind by label substring rather than by durable process key. A renamed business
process empties its lens with no error. Binding to the process key is the fix and belongs with the
folder work.
