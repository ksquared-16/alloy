---
owner: platform
status: defect fixed + authority established
last_reviewed: 2026-07-29
---

# Subject authority — a named subject is intent, not a hint

Baseline: staging `bd07ec957`. This began as a performance investigation into deep-link duplicate
provisioning work and found a **correctness defect** that outranks it.

---

## 1. The defect

`?subject_id=<id>` on the work-unit route resolved through `workUnitProvisioningAnswer.ts`:

```ts
const requested = req.requestedSubjectId
    ? subjectRows.find((s) => s.entityId === req.requestedSubjectId) ?? null
    : null;
const chosen = requested ?? resolveDefaultOperationalSubject(subjectRows, strategy, {...});
```

When the requested id was **not present in the evaluated page**, `requested` fell to `null` and the
composer selected the **default subject** — returning `terminal: "operational"` with no error and no
signal, while the URL still named the requested record.

**Measured on a prod build before the fix** (API boundary, real database, real operator session):

| request | terminal | subject returned |
|---|---|---|
| no `subject_id` | `operational` | `96f92d31…` (default) |
| `?subject_id=b29921ca…` (on page) | `operational` | `b29921ca…` — honoured |
| `?subject_id=00000000-0000-4000-8000-000000000001` | `operational` | **`96f92d31…` — the default, silently** |

In an childcare enrollment surface that is **an operator shown a different family than the one the
link named**, with the panel asserting it is operational. It is the same fabrication class this
initiative has now found four times — assert a conclusion the data does not support — but with the
highest possible stakes, because the operator has no way to detect it.

**Absence does not mean "no such record."** The id may be beyond `PROVISIONING_ROW_PAGE_CAP` (100),
outside the active lens, or in another work unit. All of those are reachable in ordinary operation —
a stale queue link, a bookmark, a record that moved stage. This is not an exotic path.

## 2. Ownership — where subject authority actually lives

| Question | Answer |
|---|---|
| Canonical URL form | `?subject_id=` query — **not** a path segment. `attention.ts` `attentionFromUrl` (:316-332) and `urlFromAttention` (:350-357) are symmetric and both query-based. |
| Earliest server boundary the subject is known | The **route handler / composer** (`composeProvisioningAnswerForRoute` → `composeWorkUnitProvisioningAnswer`). |
| Why the layout composes the *default* | `[workUnitSlug]/layout.tsx` passes `requestedSubjectId: null` because a Next **layout receives no `searchParams`** — a structural framework constraint, not an oversight. |
| Is the server compose required? | For the **seed** it is an optimization. Authorization, tenant scope and route identity are resolved by the gate *before* it (`gate.orgId` from the authenticated session, never the URL). |
| Authorization of a requested subject | Structural: `requestedSubjectId` can only `.find()` within `subjectRows`, derived from an org- and work-unit-scoped read. A cross-tenant id cannot select anything. |

### The route-segment idea is dead — recorded so it is not re-tried

`layout.tsx:18` still advertises an "optional `:recordId` child segment". That segment **was deleted**
in `558e4ae2a` ("retire the legacy path-drawer record-open duality (RA-2)"), the rewrite that served
it was removed from `next.config.ts:300-302`, and `canonicalOperatorRoutes.ts:16-17` records why: the
path form "selected the DEFAULT subject rather than the requested record".

It would not have helped anyway. **An App Router layout's `params` contains only the dynamic segments
from the root down to its own segment — never its descendants.** A `[recordId]` child would hand the
param to the *child*, which is the page-segment position whose seed was already measured to lose the
hydration race. The idea fails twice, independently. (The stale comment at `layout.tsx:18` should be
corrected when that file is next touched.)

## 3. The fix

Refuse rather than substitute. The composer already had a doctrine-sanctioned honest terminal for the
neighbouring case ("rows exist but no subject could be chosen — honest, never a fabricated subject");
this extends the same terminal to the requested-but-absent case, **before** the default fallback can run.

- A caller that names a subject gets that subject or an honest error — never a different one.
- A caller that names **no** subject still gets the default. The fallback is narrowed to the case where
  no intent was expressed, not removed.
- The layout's own compose is unaffected: it passes `requestedSubjectId: null`, so the bare route,
  queue-row click, record switching and the seed path all behave exactly as before.

## 4. Certification (prod build, staging baseline)

**API boundary** — the authority itself:

| request | before | after |
|---|---|---|
| no `subject_id` | `operational`, default | `operational`, default — unchanged |
| on-page subject | `operational`, honoured | `operational`, honoured — unchanged |
| absent subject | **`operational`, silently the default** | **`error`, no subject, explicit reason** |

**Operator-visible** (`?subject_id=` cold deep link, prod build):

| | real subject | absent subject |
|---|---|---|
| panel subject attr | `b29921ca…` | none |
| `data-focus-panel-operational` | `resolved` | none |
| cards rendered | 4 | 0 |
| wrong family shown | — | **no** |
| page errors | 0 | 0 |

**Gates:** build exit 0 (`verify:module-imports ok`, 8679 files) · runtime suites **74 adminV2/runtime
failures with `comm -13` EMPTY vs the staging baseline**; the 5 `tests/runtime/` failures
(4 in `d1ProvisioningAnswer`, 1 in `d4SettlementReservedGeometry`) were verified **pre-existing** by
reverting the fix and re-running — identical names, 5 failed / 24 passed either way.

## 5. Known follow-up, deliberately not taken here

The operator currently sees the composer's **internal reason string** verbatim
("the requested subject is not present in this work unit's evaluated page — refusing to substitute a
different subject"). The *behaviour* is correct and safe — no wrong family, no crash — but the wording
is engineering-toned. Operator-facing copy is a product-voice decision, so it is flagged rather than
invented. A truthful operator phrasing would say the record is not in this work unit's current view and
offer the way back.

**Still open, and now clearly secondary:** the deep-link *duplicate compose* (server composes the
default subject, client composes the requested one). That is an efficiency defect; this was a
correctness one. It remains bounded by the same structural constraint — a layout cannot see
`searchParams` — and its options are recorded in `PE3-ARCHITECTURE-OPTIONS.md` §2 and
`CP1-ENRICHED-VM-WATERFALL.md` §5.
