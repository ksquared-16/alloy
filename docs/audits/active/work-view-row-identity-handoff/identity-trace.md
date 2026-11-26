# Work View row identity — the handoff mismatch

**Sprint:** `work-view-row-identity-handoff` · slot 4 · base `cfe86b2b3`.

## Provenance

Traced from the runtime source on `origin/staging`, not inferred from the screenshot. The refusal
string in the report is emitted at exactly one place:

`web/lib/runtime/provisioning/workUnitProvisioningAnswer.ts:1112` — `subject_unavailable`.

No staging operator credentials exist in this repo, so the live payload capture is deferred; the
identities below are read off the code that produces and consumes them, which is stronger than a
screenshot for this question because it names the fields.

## What the Work View considers "the record present in this evaluated page"

`workUnitProvisioningAnswer.ts:1082-1097` builds the selectable set, and the identity is **grain
dependent**:

```ts
const subjectRows = childRows
    ? childRows.map((r, i) => ({                      // CHILD grain
          id:        String(r.participationId ?? ""), // process_instances.id
          entityId:  String(r.participationId ?? ""),
          entityType: "child",
      }))
    : page.map((r, i) => ({                           // FAMILY grain
          id:        String(r.id),                    // opportunities.id
          entityId:  String(r.id),
          entityType: "opportunity",
      }));

const requested = req.requestedSubjectId
    ? subjectRows.find((s) => s.entityId === req.requestedSubjectId) ?? null
    : null;
if (req.requestedSubjectId && !requested) return fail("subject_unavailable", …);
```

The file states the rule itself:

> `subjectId` (the durable child) is deliberately **NOT** the row id: the same child can hold two
> participations across two leads, and those are two different rows.

So for a child-grain lens the selection identity is the **participation id** (`process_instances.id`)
— not the durable child (`customer_members.id`), and certainly not the case.

## What Search sends

`web/lib/runtime/focus/useOperatorRecordFocus.ts` resolves a focus target and then uses **one id for
both host and subject**, at all three exits:

```ts
const hostId = target?.host_entity_id?.trim() ?? "";   // the CASE (opportunities.id)

move(href, null, hostId, aspect);                       // in-kernel  → SUBJECT = host
dispatchOperatorFocusSelection({ entity_id: hostId });  // shell      → SUBJECT = host
new URLSearchParams({ subject_id: hostId });            // cold load  → SUBJECT = host
```

`hostId` is the Kurzman family/case opportunity. For a **family**-grain lens that is exactly right —
the case *is* the evaluated row. For a **child**-grain lens it can never match, because every
`entityId` in that page is a participation id.

Hence the refusal, and hence it is correct. The guard is not the bug.

## The manual row click — the authority

`web/lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts:250` is what an operator clicking
Lennon's row actually does:

```ts
const openRecord = (row: QueueRowModel) =>
    kernel.attention.move({ scope: ATTENTION_SCOPE.SUBJECT, subject: row.entityId, … });
```

`row.entityId` is the same field the guard matches on. **Search must produce the same selection
target as this click** — that is the whole correction.

## Identity table — Lennon

| Concept | Lennon value | Used today? | Correct ownership |
|---|---|---|---|
| Work View | `waitlist` (child-grain lens) | ✅ correct since PR #426 | operational cohort |
| **Work View row id** | **`process_instances.id`** for Lennon's Enrollment participation | ❌ **never sent** | **selection in evaluated page** |
| Host case/opportunity | Kurzman family case `opportunities.id` | ⚠️ sent **as the subject** | Focus Panel host |
| Canonical child id | `customer_members.id` | sent as `item_id` (ASPECT) | subject / item |
| Person id | may be NULL — `customer_members.person_id` is nullable | not used for selection | identity if present |
| ASPECT item id | `customer_members.id` | ✅ correct | Focus Panel child |

**One row of that table is the entire defect**: the Work View row id is never carried, and the host is
substituted in its place.

## Why the fix is small

Search already reads the participation — `searchEnrichment.ts:456` queries `process_instances` and
selects every column it needs *except* `id`. The identity the runtime demands is one column away from
being in hand, and membership evaluation already happens per participation row.

## Required separation (locked)

| Concept | Lennon |
|---|---|
| Work View | Waitlist |
| Operational member | Lennon's child-grain Waitlist row (**participation id**) |
| Focus Panel host | Kurzman case |
| Operator subject | Lennon |
| ASPECT | Children → Lennon |

Related but **not interchangeable**. A family/case may host a child Focus Panel without itself being
the selected child-grain member.

## Pagination — a second, independent exposure

`PROVISIONING_ROW_PAGE_CAP = 100`. The selectable set is the **evaluated page**, capped. The refusal
comment says so outright:

> Absence here does NOT mean "no such record" — the id may be beyond the page cap, outside the active
> lens, or in another work unit.

So even with the correct member id, a truthful member sorted past row 100 is unreachable by direct
navigation. Sending the right identity is necessary but **not sufficient**; acceptance case E exists
to prove this, and it must not be "solved" by raising the cap.
