# Stage 1 audit — Roster People + Search + Contextual Card Convergence

Base: `origin/staging` @ `11df0cdce` (PR #434 merged). Read-only audit; no product code changed.

Every claim below is from current code at that commit, cited by file and line.

---

## 1. Context model

### What exists

There is **one** shared context projection, and it lives in Search:

`web/lib/search/searchEnrichment.ts` → `enrichSearchCandidates()` returns
`SearchContext[]` per subject. `SearchContext` is declared in
`web/lib/search/searchContracts.ts:131`.

Declared kinds: `process | schedule | relationship | placement`
(`searchContracts.ts:88`). **Only two are ever produced**:

| kind | produced at | source of truth |
|---|---|---|
| `process` | `searchEnrichment.ts:266` | `process_instances` keyed on subject (`customer_members.id` for a child, `persons.id` for a person) |
| `schedule` | `searchEnrichment.ts:334` | `schedule_assignments`, child grain only |

`relationship` resolves to `null` by declaration
(`searchDestinations.ts:346`). `placement` has a destination resolver but no
producer — `rg 'kind: "placement"'` returns nothing anywhere in `web/`.

A `process` context carries, per participation:
`destination_entity_type/_id`, `destination_work_unit_key`,
`destination_work_view_id`, and `operational_memberships[]` — every configured
Work View the subject **provably** belongs to, evaluated through
`resolveOperationalMemberships` (`web/lib/search/searchOperationalMemberships.ts`)
at the correct grain, with `operational_member_id` = `process_instances.id` for a
child and `opportunities.id` for a family.

That last field is the load-bearing one: it means the projection already knows
**which business context a child is in, at which stage, in which cohorts** —
which is exactly the enumeration the Roster contextual card needs.

### What does NOT exist in that projection

- **Employment.** Zero references to employment anywhere in `web/lib/search/*`
  (verified by grep). Employment truth lives in `web/lib/employment/`
  (`employmentService.ts`, `buildPersonEmploymentComposition.ts`) and reaches a
  panel only via `OperationalEmploymentSignal`
  (`operationalContext/types.ts:159`), projected from the **case**, or via
  `composeDurablePersonSubject` on the durable person path.
- **Placement / Assignment as a distinct context.** `child_placements` is read by
  `web/lib/adminV2/records/childCohortQuery.ts:138` and by
  `web/lib/childcareOperational/childPlacementService.ts`, but never surfaces as
  a `SearchContext`. The nearest thing is the `schedule` context, which reads
  `schedule_assignments` (the compatible storage table that
  `operationalAssignmentService.ts:4` documents as extended in place for both
  children and staff).
- **Billing.** `OperationalBillingSignal` (`operationalContext/types.ts:123`) is a
  read-only projection of a `billing_configured` flag on the composed
  opportunity record, explicitly "Deferred (read-only) until the billing
  assignment write path exists". **Billing is not a canonical business context
  today.** It is a case-scoped flag.
- **Staff onboarding.** No such process exists in code.
- **Access.** Configuration (`user_roles`, access scope), not a record context.
  Correctly excluded.

### Verdict on stop condition 2 ("second context index")

**NOT TRIGGERED — conditionally.** `enrichSearchCandidates` is a pure function
over `SearchCandidate[]` plus a Supabase client; it is not welded to the search
retrieval pipeline. Roster can obtain contexts for one subject by calling the
same projection with a single synthesised candidate.

The condition **becomes** triggered the moment Roster writes its own
`process_instances` read. The correct move is to lift the enumeration out of
`lib/search` into a neutral module (e.g. `lib/context/`) that both Search and
Roster call — a **move**, not a copy — leaving `searchEnrichment` as its first
consumer.

Employment must be added to that one projection as a context kind, not resolved
separately by Roster, or Staff acquires a second index.

---

## 2. Effective surface resolution — Enrollment + Waitlist + Child, traced

Exact runtime path for the native Focus Panel today.

### The addressing keys

`web/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel.ts:37-39`

```
FOCUS_PANEL_SUMMARY_ENTITY_TYPE = "opportunities"
FOCUS_PANEL_SUMMARY_SURFACE     = "drawer"
FOCUS_PANEL_SUMMARY_LAYOUT_KEY  = "focus_panel_summary"
```

One `entity_layouts` row per org holds the whole Focus Panel Summary
composition.

### The chain

1. **Work View / lens** — the operator commits a lens on a Work Unit surface.
   `businessProcessKey` + `workViewId` (+ `stageKey`, `statusKey`) are the
   committed applicability context.

2. **Provider** — `FocusPanelSummaryDocProvider`
   (`usePublishedFocusPanelSummaryDoc.ts:141`) is mounted at the Focus Panel host
   with that scope, and caches one answer per scope
   (`scopeKey()`, line 44).

3. **Fetch** — `GET /api/admin/entity-layouts/focus-panel-summary?businessProcessKey=…&workViewId=…&stageKey=…&statusKey=…`
   (`web/app/api/admin/entity-layouts/focus-panel-summary/route.ts:44`).

4. **Candidate load** — `listOrgLayouts(supabase, orgId, "opportunities", "drawer")`
   filtered to `layoutKey === "focus_panel_summary"` (route.ts:59-66).

5. **Applicability** — `resolvePublishedFocusPanelSummaryRecord`
   (`resolveFocusPanelSummaryVariant.ts:66`) maps each row to a
   `SurfaceVariantCandidate` reading its BP/WorkView/stage/status constraints
   from `entity_layouts.metadata`, then delegates to the **one** resolver
   `resolveSurfaceVariant` (`web/lib/layout/resolveSurfaceVariant.ts`).
   Precedence: Work View (8) ≻ stage (4) ≻ status (2), then highest version
   (`resolveSurfaceVariant.ts:68-70`).

6. **Effective card set** — `OpportunityFocusPanelModeGrid.tsx:175-186`:
   `activeDoc` → `deriveFocusPanelInstanceMap(activeDoc)` and
   `deriveFocusPanelGridFromLayoutDoc(activeDoc)`; explicit published geometry
   comes from `deriveFocusPanelSummaryCompositionInputs(activeDoc).publishedLayout`
   (line 199).

7. **The configured CHILD card** — this is the part worth stating precisely.
   There is no separate "Child card layout" row. The configured Child card is the
   **`children` card's nested surface**, and its configuration is carried inside
   the *same* doc at `doc.metadata.nestedSurfaces[CHILDREN_SURFACE_ID]`:

   - `web/lib/adminV2/runtime/focusPanel/nestedSurfaceConfigReader.ts:20`
     (`readNestedSurfaceConfigFromDoc`)
   - `web/lib/adminV2/runtime/focusPanel/children/childrenNestedSurfaceConfig.ts:57`
     (`readChildrenNestedConfigFromDoc`) → `effectiveChildrenNestedConfig`
   - field selection, per-field labels, group/section order, layout width and
     editability all resolve from that config
     (`childrenNestedSurfaceConfig.ts:32-47`,
     `children/childIdentityFieldRuntime.ts`,
     `children/childFocusFieldPolicy.ts`).

8. **Renderer** — `FocusPanelCardGrid` + `FocusPanelCardRenderer`
   (`components/admin/focusPanel/`), Children card body in
   `components/admin/focusPanel/cards/ChildrenCard.tsx`.

### The mechanism, stated plainly

> The configured Waitlist Child card appears because the org's
> `entity_layouts` row `(org, "opportunities", "drawer", "focus_panel_summary")`
> — selected among published variants by `resolveSurfaceVariant` against
> `(businessProcessKey, workViewId, stageKey, statusKey)` — carries a
> `metadata.nestedSurfaces["children_surface"]` config that names the fields,
> labels, order and editability the Children card renders for the focused child.

**Critically: the subject is not in the address.** Neither the child, nor the
opportunity, nor the Work Unit id participates in selecting the configuration.
`SurfaceVariantContext.subjectType` exists as a field but is explicitly
`"reserved; opportunity-only today"` (`resolveSurfaceVariant.ts:33`) and
`candidateApplies()` never reads it (lines 79-88).

There is a **second, older** resolution path — `resolveLayoutForOrg`
(`web/lib/layout/resolveLayoutRuntime.ts:46`) → `business_process_layout_assignments`
(migration `20260622180000`), with surface keys including `child_drawer`
(`businessProcessLayoutAssignmentTypes.ts:44`). Its assignment context is
likewise `{businessProcessKey, stageKey, statusKey}` only
(`businessProcessLayoutAssignmentTypes.ts:79`). It is **not** what the Focus
Panel Summary uses; `child_drawer` as a *runtime* surface key has no live
consumer (`layoutAssignmentSurfaceKeyForRuntime` can emit it, but nothing calls
`resolveLayoutForOrg` with `entityType: "child"` on the Focus Panel path).

---

## 3. Durable-host reuse — **YES, with one code gate. No schema block.**

### The answer

**YES** — Roster/Search can request the same effective configured contextual card
without copying or re-publishing configuration, *provided the durable host
supplies a business context*.

Evidence:

- The configuration is addressed by `(orgId, businessProcessKey, workViewId,
  stageKey, statusKey)` and nothing else (§2, step 5). No opportunity id, no work
  unit key, no subject id.
- The endpoint that serves it is a plain GET with those four query params
  (`focus-panel-summary/route.ts:69-75`). Any host may call it.
- The nested Children-surface config is read from the returned doc by a pure
  function (`readChildrenNestedConfigFromDoc(doc)`).
- The renderer is already source-agnostic: `DurableRecordSurface`
  (`components/presentation/durableRecord/DurableRecordSurface.tsx:129`) renders
  `OpportunityFocusPanelModeGrid` — the **same** grid, same card renderers.

### The exact blocking seam (a code gate, not a coupling)

`web/components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx:173-177`:

```ts
const isCaseGrain = subjectGrain === "opportunity";
const publishedDoc = usePublishedFocusPanelSummaryDoc(isSummary && isCaseGrain);
const activeDoc = isSummary
    ? (isCaseGrain ? publishedDoc : null) ?? focusPanelSummaryDefaultDocForGrain(subjectGrain)
    : null;
```

A `child`/`person` subject **never** consults the publication; it gets a
code-owned default doc (`buildFocusPanelSummaryDefaultDoc.ts:112`).

The guard is currently **correct**, and its docblock says why: a durable subject
has no business context, so applying the enrollment doc to it would put
`current_work`/`household`/`children` on a staff member. The second half of the
reason is upstream, in the producer:

`durableSubject/focusPanelWorkModeModelFromDurableSubject.ts:146-149` sets
`businessProcess: { key: null, label: null, stageKey: null }` **deliberately**,
and `OperationalHostContext` (`operationalContext/types.ts:329`) is narrowed on
purpose to `{opportunityId, workUnitKey}` so a durable panel "can note that a
case exists without being able to reach into that case's composition".

So the seam is:

> The durable host cannot consume the configured surface because it has **no
> selected business context to resolve it against** — not because the
> configuration is bound to an Opportunity or a Work Unit.

That is precisely the gap the proposed context-selector architecture fills. Once
the durable host lets the operator select `Enrollment → Waitlist`, it has
`(businessProcessKey, stageKey)` and can call the identical endpoint and get the
identical doc.

**Stop conditions 1 and 6: NOT triggered.** No configuration copy is required and
no Roster layout is required.

### What is genuinely blocked (and is not needed)

A tenant cannot **publish** a *child-grain whole surface*. That is R9 (§4). The
target architecture does not ask for one — it asks to reuse the existing
Enrollment/Waitlist configuration. Keep it that way.

### What today's durable child card actually is

One code-built card, `child_identity`
(`durableSubject/deriveChildFocusPanelCards.ts:57`), with four hardcoded
`profileFields` (Name, Date of birth, Age, Household) and
`primaryAction: null`. It reads **no** configured field selection, **no**
configured labels, and offers **no** edit. It is not the configured Child card
rendered flatter; it is a different card.

---

## 4. Surface Builder — publication and addressing

### Persisted owner

`public.entity_layouts` (migration `20260603120000_entity_layouts_v2.sql`).

Row identity: `UNIQUE (org_id, entity_type, surface, layout_key, version)`, plus
a partial unique index for system defaults (`org_id IS NULL`).
`status ∈ {draft, published}`; the resolver takes published only.

`surface` CHECK is `drawer | queue | workspace`
(widened by `20260715000002_entity_layouts_workspace_surface.sql`).

### How it is addressed

| axis | in the row | in the assignment | notes |
|---|---|---|---|
| tenant | `org_id` (NULL = system default) | `org_id` | ✅ |
| entity type | `entity_type` | `entity_type` | Focus Panel Summary is **hardcoded `"opportunities"`** |
| surface | `surface` | `surface` | Focus Panel Summary is **hardcoded `"drawer"`** |
| layout key | `layout_key` | `layout_key` | Focus Panel Summary is **hardcoded `"focus_panel_summary"`** |
| business process | `metadata.businessProcessKey` | `business_process_key` | ✅ |
| Work View | `metadata.workViewId` | ✗ (assignment table has no Work View column) | ✅ on the variant path |
| stage | `metadata.stageKey` | `stage_key` | ✅ |
| status | `metadata.statusKey` | `status_key` | ✅ |
| **subject grain** | **✗** | **✗** | field reserved, never evaluated |
| route / surface path | ✗ | `surface_key` (`opportunity_drawer`, `person_drawer`, `child_drawer`, `queue_record`, `waitlist_queue_record`) | assignment path only |
| Opportunity / case id | **✗** | **✗** | **never keyed by case** |

**The publication is not keyed by Opportunity, case, or Work Unit.** It is keyed
by tenant + process + lens + stage/status. This is the fact that makes §3's
answer YES.

### How configured fields/labels/order/sections become effective

Two layers in one doc:

1. **Card composition** — `doc.sections` (one section per card, with
   `gridRow`/span/density/visibility) plus
   `doc.metadata.publishedLayout` (explicit 12-column grid geometry).
   Decoded by `deriveFocusPanelGridFromLayoutDoc` and
   `deriveFocusPanelSummaryCompositionInputs`.
2. **Within-card field configuration** — `doc.metadata.nestedSurfaces[surfaceId]`,
   reconciled by `reconcileNestedSurfaceConfig`
   (`lib/adminV2/settings/surfaces/nestedSurfaceEditorModel.ts`), read at runtime
   by `nestedSurfaceConfigReader.ts`. Group order → field order within group is
   the reading order (`nestedSurfaceFieldKeysFromConfig`). Labels resolve through
   `fieldPresentationLabel` / `resolveCanonicalIdentityFieldLabel`. Visibility and
   editability through `fieldShouldRender` / `fieldIsSaveable` +
   `isIdentityFieldSaveSupported`.

### R9 — current status

**OPEN.** Recorded twice in code and once in doctrine:

- `buildFocusPanelSummaryDefaultDoc.ts:85-90` —
  *"⚠ STILL `opportunities`… a tenant cannot PUBLISH one until the addressing is widened."*
- `OpportunityFocusPanelModeGrid.tsx:161-172` — the load-bearing grain guard.
- `docs/runtime/DURABLE-RECORD-ATTENTION.md:190` — R9 row: *"OPEN, and deliberately not worked around."*

**What R9 blocks:** publishing a *durable Person/Child-grain* Focus Panel
composition.
**What R9 does NOT block:** a durable host resolving the **existing case-grain,
context-scoped** published doc and rendering the configured Child card from it.

Stage 1 recommends **not** widening the addressing. The target experience does
not need it.

---

## 5. ASPECT

### What it is

`web/lib/runtime/kernel/attentionCardFocus.ts`. Card + row focus is encoded as a
single kernel ASPECT string: `card:children|item:cm-lennon|context:enrollment`
(`formatCardFocusAspect`, line 55). Scope nesting is
`SURFACE ⊃ LENS ⊃ SUBJECT ⊃ ASPECT`; an ASPECT movement inherits
target/lens/subject and cannot cancel anything coarser (module docblock, lines
1-13). It is URL-projected as `?aspect=` so a focused card is deep-linkable.

### Does it affect configuration selection?

**No.** Verified two ways:

- `FocusPanelSummaryVariantContext`
  (`resolveFocusPanelSummaryVariant.ts:30`) has exactly four fields —
  `businessProcessKey`, `workViewId`, `stageKey`, `statusKey`. No card, no
  aspect.
- The grid resolves `activeDoc` from `(isSummary, isCaseGrain, publishedDoc)`
  and passes `requestedCardFocus` separately as a **render-time elevation**
  (`OpportunityFocusPanelModeGrid.tsx`, `Props.requestedCardFocus`).

On the durable route the same holds: `?card=` is read by the page
(`workspace/record/[subjectType]/[subjectId]/page.tsx:44`) and passed straight
through to `requestedCardFocus`.

**The desired invariant already holds.** ASPECT focuses the configured card; it
never selects a different copy of its configuration. Nothing to change here.

---

## 6. Roster re-home — exact inventory

Records is a shell-level modal (`AdminV2WorkspaceModalKey` includes `"records"`,
`lib/adminV2/workspaceModalCoordinator.ts:23`) built on the **same**
`WorkspaceShell` Roster uses (`RecordsWorkspaceShell.tsx` vs
`RosterWorkspaceShell.tsx` — identical chrome contract, both single-mode with
`showModeRail={false}`).

### Moves unchanged — Children

| piece | file | note |
|---|---|---|
| section component | `web/components/adminV2/records/RecordsChildrenSection.tsx` (453 ln) | already takes `siteLocationId` prop that Records never supplies — Roster has a site picker, so this becomes live for free |
| cohort bar | `web/components/adminV2/records/RecordsCohortBar.tsx` | generic over `T`, shared with Staff |
| cohort model | `web/lib/adminV2/records/recordCohorts.ts` | |
| server cohort query | `web/lib/adminV2/records/childCohortQuery.ts` | scope → site → cohort → search → order → paginate, server-owned |
| state derivation | `web/lib/adminV2/records/childEnrollmentState.ts` | |
| row next-actions | `web/lib/adminV2/records/childNextActions.ts` | |
| projection API | `web/app/api/admin/records/children/route.ts` | |
| Add Child | `web/components/adminV2/records/AddChildModal.tsx` + `web/app/api/admin/records/child-identity/route.ts` + `child.add` capability | |
| Direct enroll | `web/components/adminV2/records/DirectEnrollModal.tsx` + `web/lib/records/directEnrollService.ts` | from PR #434 |
| Start enrollment | `ENROLLMENT_START_ACTION_KEY` via `/api/admin/actions/execute` | from PR #434 |
| record-open | `useOperatorRecordFocus({intent:"durable_record"})` | `RecordsChildrenSection.tsx:244-256` |

### Moves unchanged — Staff

| piece | file |
|---|---|
| section component | `web/components/adminV2/records/RecordsStaffSection.tsx` (274 ln) |
| projection API | `GET /api/admin/staff/directory?include_ended=true` |
| cohorts | `buildStaffCohorts` in `recordCohorts.ts` |
| Add Staff | `web/components/adminV2/settings/staff/AddStaffModal.tsx` + `/api/admin/staff/resolve-person` |
| record-open | same adapter, `OPERATOR_FOCUS_CARDS.employment` aspect |

### Shared / bootstrap

`web/app/api/admin/records/bootstrap/route.ts` (positions, sites, org service
date) — loaded once in `RecordsWorkspace.tsx`. Roster loads its own sites; the
two must be reconciled to one bootstrap or the workspace will hold two answers
for "today" and "which sites".

### Deep links

`ADMIN_V2_OPEN_RECORDS_MODAL` / `RECORDS_WORKSPACE_DEEPLINK_KEY`
(`lib/adminV2/workspaceModalEvents.ts:161-162`) and
`resolveRecordsSection` (`app/adminV2/records/recordsSections.ts:27`) must be
kept resolving after the re-home, mapping `staff`/`children` onto the Roster
sections — the same way `resolveRosterSection` already absorbs the legacy
`daily_roster` key (`rosterSections.ts:33`).

### Verdict on stop condition 4 ("duplicate Records data/state")

**NOT TRIGGERED**, provided the re-home *recomposes* these components under
`RosterWorkspaceShell` and extends `RosterSection` to
`roster | attendance | staff | children`. Nothing needs re-implementing.
One genuine merge is required: **bootstrap** (positions/sites/today).

---

## 7. Search — destination model, conflation point, smallest correction

### Current destination model

`SearchDestinationTargetKind = "focus_panel" | "route"`
(`searchContracts.ts:223`). There is **no durable-record target**.
`open_drawer` was deliberately removed.

| result kind | destination built at | shape |
|---|---|---|
| identity (child) | `resolveSubjectDestination`, `searchDestinations.ts:231` | `focus_panel`, `card_key: children`, `item_id: child`, **+ `host_work_unit_key` + `host_work_view_id`** |
| identity (person) | `searchDestinations.ts:245` | `focus_panel`, `card_key: household`, **+ host unit + view** |
| household | `searchDestinations.ts:261` | `focus_panel`, `card_key: household`, **+ host unit + view** |
| Work View (cohort) | `resolveMembershipDestinations`, line 145 | `focus_panel`, key `work_view:<process>:<viewId>`, carries `host_work_view_id` + `operational_member_id` |
| process | `CONTEXT_DESTINATION_RESOLVERS.process`, line 310 | `focus_panel`, `card_key: current_work` |
| assignment/schedule | line 331 / 344 | `focus_panel`, `card_key: scheduling` |
| location | line 218 | `route` (canonical settings href) |

### The exact conflation point

**Two lines, one upstream and one downstream.**

1. **`web/lib/search/searchDestinations.ts:231-244`** —
   `resolveSubjectDestination()` for a child stamps the *record* intent
   ("Open Lennon") with

   ```ts
   host_work_unit_key: resolveHostWorkUnitKey(subject, contexts),
   host_work_view_id:  resolveHostWorkViewId(contexts),
   ```

   `resolveHostWorkViewId` picks "the subject's **first** truthful membership"
   (line 118). That is the silent choice of Waitlist the target behaviour
   forbids. The same two lines appear for `person` (255-256), `household`
   (271-272) and `resolveHouseholdDestination` (289-290).

2. **`web/app/adminV2/components/GlobalSearchBox.tsx:260-316`** —
   `openDestination()` branches on `target` only. Every `focus_panel`
   destination — including `key === "subject"`, `primary: true` — is dispatched
   through `dispatchOperatorFocusSelection` carrying `host_work_unit_key` and
   `host_work_view_id`. Record intent and operational intent execute through the
   identical code path.

The result: "Show me Lennon" and "Take me to Lennon's Waitlist work" are the
same operation with a different `card_key`.

### Smallest explicit correction

Three changes, no retrieval touched, no ranking touched:

1. Add `"durable_record"` to `SearchDestinationTargetKind`
   (`searchContracts.ts:223`), with fields `subject_type: "person"|"child"` and
   `subject_id` — reusing the vocabulary `durableSubjectTypeFor` already speaks
   (`lib/runtime/focus/durableRecordRoute.ts:36`).
2. In `resolveSubjectDestination`, emit that target for `kind === "child"` and
   `kind === "person"` and **stop setting `host_work_unit_key` /
   `host_work_view_id` on it**. Household and location are unchanged
   (household has no durable grain — §8). Every operational destination keeps its
   current shape, so `resolveMembershipDestinations` and the process/schedule
   resolvers are untouched.
3. In `GlobalSearchBox.openDestination`, add one branch:
   `target === "durable_record"` → `useOperatorRecordFocus({intent:"durable_record", …})`.
   The adapter already handles this intent
   (`useOperatorRecordFocus.ts:180-190`).

One consumer needs checking, not changing: `searchSelectionFromResult`
(`lib/search/searchSelectionAdapter.ts:73`) reads
`primary.target === "focus_panel"` to flatten a subject to a record reference for
the POS picker and the Experience Builder preview. It must learn the new target
or those two pickers silently return zero results — the exact regression that
module's docblock was written about.

**Stop condition 3 ("would require rewriting retrieval"): NOT TRIGGERED.**
`searchRetrieval.ts`, `searchRanking.ts` and `searchEnrichment.ts` are not
touched.

---

## 8. Household

### 1. Is Household a durable attention subject today?

**No.** `DurableSubjectType = "person" | "child"`
(`durableRecordRoute.ts:21`). `durableSubjectTypeFor("customers")` returns
`null` (line 36). `/workspace/record/{grain}/{id}` 404s for anything else
(`page.tsx:35`). Focus Panel grains are `opportunity | child | person`
(`focusPanelSubjectGrainRead.ts:24`) — no household grain.

### 2. Is there a canonical Household composition?

**Yes, but it is case-grain.** The `household` card
(`focusPanelCardRegistry.ts:77`, `ownsOperationalTruth: true`) is composed by
`household/buildHouseholdCardEvidence.ts`, which reads `context.truth` — the
composed **opportunity** record — for `_opportunity_persons` /
`_customer_persons` contacts and `mapRawInquiryChildrenToDrawerRows` for
children. It has a configured nested surface
(`household/householdNestedSurfaceConfig.ts`,
`householdSurfaceFields.ts`, `identityRelationshipSections.ts`) with roles
(parent/guardian, emergency, pickup, billing).

The underlying record is `customers` + `customer_persons` + `customer_members`
— genuinely durable rows. **What is missing is a durable composer**, the
household analogue of `composeDurableChildSubject` /
`composeDurablePersonSubject`. Today `composeDurableChildSubject` reads only
`customers.name` for the household label
(`composeDurableChildSubject.ts:134`).

### 3. Can Search open it?

**Not as a household record.** `SearchSubjectKind` includes `"household"`
(`searchContracts.ts:28`) and retrieval finds it, but
`resolveSubjectDestination` sends it to the household's **case**
(`resolveHost`, `searchDestinations.ts:186-190`: `household_case_entity_id` →
`{type:"opportunities"}`), focusing the `household` card there. A household with
no case resolves `{type:"customers"}` and then produces **no work unit**, so
`GlobalSearchBox` does nothing at all (`openDestination` returns early when
`host_work_unit_key` is absent).

### 4. Can a Child contextual card move attention to it?

**No.** The durable child card
(`deriveChildFocusPanelCards.ts:57-79`) shows `Household` as a **plain text
field**, not a link: `{ label: "Household", value: subject.householdName }`,
`primaryAction: null`. There is no household destination to move to.

### 5. Smallest missing seam

Three pieces, in dependency order:

1. `composeDurableHouseholdSubject(supabase, orgId, customerId)` — the household
   analogue of the two existing composers, reading `customers` +
   `customer_persons` + `customer_members`. No new model.
2. `"household"` added to `DurableSubjectType` / `OperationalSubjectType` /
   `KNOWN_GRAINS`, and a `household` grain declaration on the existing
   `household` card (`focusPanelCardRegistry.ts:77` — it currently carries no
   `grains`, so it is case-only by the silence rule).
3. A link affordance on the child's Household field, routed through
   `useOperatorRecordFocus({intent:"durable_record"})` — no new navigation
   primitive.

**Stop condition ("Household requires inventing a second family model"): NOT
TRIGGERED** — `customers` is already the family model and the composition rules
already exist in `buildHouseholdCardEvidence`. What is missing is a durable
*subject*, not a second model. But note the real work: `buildHouseholdCardEvidence`
reads case-shaped truth (`_opportunity_persons`, inquiry children), so a durable
household composer must produce equivalent truth from `customer_persons` /
`customer_members` or the card composes empty.

---

## 9. Staff

### Context

`employments` is the canonical table
(`lib/employment/employmentService.ts`). Write authority already exists and is
narrow: `createEmployment` (line 217), `updateEmployment` (line 300),
`endEmployment` (line 369), with `assertStaffPersonEligible` (line 146).

`composeDurablePersonSubject` composes a person from
`buildPersonEmploymentComposition` with **no** household, case or Work Unit
required — `durablePersonFocusPanel.test.ts` asserts exactly that.

### Card

`employment` is the **only** card declaring the person grain:
`{ key: "employment", title: "Employment", grains: ["opportunity", "person"] }`
(`focusPanelCardRegistry.ts:87`). Its person-grain model is built by
`derivePersonEmploymentCard` (`derivePersonFocusPanelCards.ts:55`), reusing
`cardTitle` / `system5ArchetypeForCard` / `system5IconForCard` so the card looks
identical on both surfaces.

### Configured fields

**None.** The Employment card has no nested-surface configuration — there is no
`employment_surface` in the nested-surface registry, and
`derivePersonEmploymentCard` phrases the composition directly. So for Staff,
"configured Employment fields" **do not exist today**.

### Edit

`primaryAction: null` on both person-grain cards
(`derivePersonFocusPanelCards.ts:72, 101`), with the docblock stating the reason:
employment is authored elsewhere and inventing a command surface here would be a
second execution path.

The `employment` capability commands exist (Staff Foundation Phase 1 /
Staff Supply Phase 2 per project history) but are not reachable from the card.

### Do the two entries converge?

Yes — both already resolve to the same place:

- `Roster → Staff → Jane` → `RecordsStaffSection` →
  `useOperatorRecordFocus({intent:"durable_record", card_focus: employment})`
- `Search → Jane · Staff` → `resolveSubjectDestination(kind:"person")` → today
  the **case** with the `household` card (the conflation in §7); after the §7
  correction, the same durable person address.

**Stop condition 5 ("a contextual card has no canonical action authority for
editing") — TRIGGERED for Employment as a card, NOT for the domain.** The
authority (`employmentService`) exists; the card does not expose it. Wiring the
existing capability to the card is legitimate; building an employment editor is
not. Do not build HRIS.

---

## 10. Visual convergence — concrete inconsistencies

Shell chrome is **already convergent**: `RecordsWorkspaceShell` and
`RosterWorkspaceShell` both wrap `components/workspace/WorkspaceShell` with the
same header/mode/section contract, both `showModeRail={false}`. The divergence
is entirely in the **section bodies**.

| concern | Roster / Attendance | Records Staff / Children | Focus Panel cards |
|---|---|---|---|
| border token | `border-alloy-stone/15 · /20 · /25 · /30` (`DailyRoster.tsx:203, 362, 370, 383, 396, 428, 541`) | `border-admin-border` (`RecordsChildrenSection.tsx:301, 313, 361, 400`; `RecordsCohortBar.tsx:100`) | `alloy-os-ucard` |
| row hover | `hover:bg-alloy-stone/[0.06]` (`DailyRoster.tsx:196`) | `hover:bg-alloy-midnight/[0.03]` (`RecordsChildrenSection.tsx:325`) | — |
| accent | Bend Pine `text-[#00A283]` **hardcoded hex** (`DailyRoster.tsx:211, 507, 522`) | Alloy Blue `bg-alloy-blue` on the primary button (`RecordsChildrenSection.tsx:274`) | `processCardAccentStyles.ts` maps `pine → Bend Pine #00A283` |
| corner radius | `rounded-lg` on cards, `rounded` on controls | `rounded` throughout | `alloy-os-ucard` |
| active tab/chip | shell section tabs (WorkspaceShell) | a **second** pill vocabulary: `rounded-full bg-alloy-midnight text-white` cohort chips (`RecordsCohortBar.tsx:74-77`) | — |
| secondary button | `rounded border border-alloy-stone/25 px-2 py-1 text-[12px] text-alloy-midnight/70 hover:bg-alloy-stone/10` | `rounded border border-admin-border px-2 py-0.5 text-[11px] text-alloy-midnight/70 hover:bg-alloy-midnight/5` (`RecordsChildrenSection.tsx:361, 373`) | — |
| row density | `px-2 py-1.5`, meta at `text-[11px]` | `px-3 py-2.5`, meta at `text-[11px]`, plus a **second stacked action strip** below the row (`RecordsChildrenSection.tsx:353-386`) | — |
| empty state | `rounded-lg border-dashed border-alloy-stone/30 px-4 py-10` (`DailyRoster.tsx:428`) | `rounded border-dashed border-admin-border px-4 py-8` (`RecordsChildrenSection.tsx:301`) | — |
| dead white space | rooms grid `lg:grid-cols-2` fills | Children list is a single full-width `<ul>` on `bg-white` with no right column, and `metricsColumn` is never supplied by `RecordsWorkspace` | — |
| overlay | Roster is a shell modal | Records is a shell modal; the **record** leaves both and becomes a full page (§11) | Focus Panel is inline in the Work Unit surface |

Convergence work is token substitution and one shared row/action-strip primitive,
not a redesign:

- pick **one** border token for section bodies (`alloy-stone/20-ish`, since
  Roster/Attendance and the Focus Panel already agree) and retire
  `border-admin-border` from these four surfaces;
- pick **one** row hover;
- replace the hardcoded `#00A283` with the existing Bend Pine token and settle
  which accent a record surface uses (Records' `bg-alloy-blue` primary is the
  outlier);
- collapse the cohort-chip vocabulary onto whatever the shell's section tabs
  already use, or state explicitly that cohorts are a second, subordinate level;
- give Children a `metricsColumn` or accept the full-width list deliberately.

None of this changes the visual system. It reuses it.

---

## 11. Record-host lifecycle

### What happens today

`RecordsChildrenSection.openChild` (line 244):

```ts
void focusRecord({ entity_type: "customer_members", entity_id, intent: "durable_record",
                   card_focus: { card_key: "child_identity" } })
    .then((moved) => { if (moved !== false) onClose?.(); });
```

`useOperatorRecordFocus` on `durable_record`
(`useOperatorRecordFocus.ts:180-190`) does `router.push(durableRecordHref(...))`
— a **full route navigation** to `/workspace/record/child/{id}`. Records then
closes itself.

Consequences, all real today:

- The Roster/Records modal is unmounted (`closeWorkspaceModal`), and shell modals
  are mutually exclusive (`workspaceModalCoordinator.ts:76`), so nothing remains
  underneath.
- Cohort, filter, `nextOffset`, `total`, scroll are component-local `useState` in
  `RecordsChildrenSection` — **destroyed** on unmount.
- Returning is browser Back, which re-mounts the workspace at defaults
  (`section` resets to `"staff"`, cohort to `"all"`).
- The row cannot refresh, because the surface that owned the row is gone.

### Which primitives should own the target lifecycle

The pieces all exist; none of them is Drawer.

| need | existing primitive |
|---|---|
| render the record | `OpportunityFocusPanelModeGrid` — already source-agnostic and already used by `DurableRecordSurface` |
| compose the record | `GET /api/admin/durable-record` — no Work Unit, no route required |
| land on a card | ASPECT (`formatCardFocusAspect`) / `requestedCardFocus` — no routing needed |
| state the intent | `useOperatorRecordFocus` — already owns the two intents |
| keep the workspace mounted | `WorkspaceShell` + the workspace-modal coordinator |
| preserve list state | lift Roster section state (cohort, filter, offset, site, scroll) out of `RecordsChildrenSection` into the Roster workspace, or keep it and simply **do not unmount** |
| refresh one row | `reloadToken` already exists (`RecordsChildrenSection.tsx:107`) |

The missing seam is exactly one thing:

> **`intent: "durable_record"` has only a ROUTE realisation.** There is no
> in-workspace durable host, so a durable gesture must leave the workspace.

The smallest fix mirrors what the adapter already does for the operational
intent, which has three realisations chosen by where the caller stands
(in-kernel movement / in-layout event / cold-entry route). Give
`durable_record` a second realisation: when the caller is inside a workspace that
declares a record host, dispatch an event the host consumes and render
`DurableRecordSurface` **over** the section, keeping the section mounted. The
route stays as the cold-entry address and the deep link.

`ADMIN_V2_OPEN_RECORDS_MODAL` / `dispatchOperatorFocusSelection` are the existing
patterns for exactly this shape of in-layout intent statement.

Edit → save → close → row refresh then becomes: save through the canonical
authority (§12 slice 4) → close the record host → `setReloadToken(n => n+1)` on
the still-mounted section. No navigation at any point.

---

## 12. Implementation plan — smallest ordered slices

Each slice is independently shippable and independently certifiable. No slice
requires a schema change; R9 stays open and unworked-around.

**Slice 0 — Roster re-home (no behaviour change).**
Extend `RosterSection` to `roster | attendance | staff | children`; mount
`RecordsStaffSection` / `RecordsChildrenSection` unchanged under
`RosterWorkspaceShell`; merge the Records bootstrap into Roster's; keep
`ADMIN_V2_OPEN_RECORDS_MODAL` + `resolveRecordsSection` resolving onto the new
sections. Pass Roster's `siteId` into `RecordsChildrenSection.siteLocationId`
(the prop already exists and is already composed server-side). Records workspace
becomes a redirect, then is removed in a later slice.
*Proof: every Records browser assertion passes against the Roster shell.*

**Slice 1 — Visual convergence (§10).**
Token substitution only. No component restructuring.

**Slice 2 — Search: record intent vs operational intent (§7).**
Add `durable_record` target; strip `host_work_unit_key`/`host_work_view_id` from
the subject destination for child/person; branch in `GlobalSearchBox`; teach
`searchSelectionFromResult` the new target.
*Proof: a child result's primary destination carries no work view; the Waitlist
membership destination still carries one; the POS picker still resolves.*

**Slice 3 — Context enumeration, lifted and shared (§1).**
Move `enrichSearchCandidates`'s context assembly into a neutral module callable
for a single subject; Search becomes its first consumer, unchanged. Add
`employment` as a context kind sourced from `lib/employment`, so Staff has a
context without a second index. Do **not** add Billing — it has no canonical
context today.
*Proof: Search output is byte-identical; the same call for one child returns the
same contexts.*

**Slice 4 — Contextual host: select a context, resolve the real configuration
(§3).**
The load-bearing slice.
(a) Durable host renders a context selector from Slice 3's enumeration; nothing
is hardcoded and nothing is prioritised by domain.
(b) On selection, the durable model carries a real
`businessProcess: {key, stageKey}` instead of the current deliberate nulls
(`focusPanelWorkModeModelFromDurableSubject.ts:146`).
(c) Replace the blunt `isCaseGrain` gate
(`OpportunityFocusPanelModeGrid.tsx:173-177`) with
*"consult the publication when a business context is present"* — which restores
the guard's original intent (a contextless durable subject still gets the code
default) while letting a context-selected subject resolve the identical published
doc through the identical endpoint.
(d) Render the configured Children nested surface for the selected child.
*Proof — the non-negotiable invariant, asserted directly: for one child at
Enrollment/Waitlist, the doc id + version, the resolved field key list, labels,
order, sections and visibility are **equal** between the native Focus Panel and
the durable host. Not "both render" — equal.*
*Plus the regression that would be invisible: a contextless durable child (no
enrollment ever) still composes the sparse code default, unchanged.*

**Slice 5 — Record-host lifecycle (§11).**
Second realisation of `intent: "durable_record"` for in-workspace callers;
Roster stays mounted; row refresh via the existing `reloadToken`. Route stays as
cold entry.

**Slice 6 — Child editing (§12 below / §7 of the brief).**
Expose the configured card's existing edit affordances on the durable host by
reusing `buildIdentityInlineChildSavePatch` + the canonical write targets.
Requires decoupling the orchestrator from `opportunityId` (see below). No new
CRUD, no generic Edit Record form.

**Slice 7 — Household as a durable subject (§8).**
Only after Slices 4-6 prove the pattern.

**Slice 8 — Employment card action authority (§9).**
Wire the existing employment capability to the card. Nothing more.

---

## Appendix — Child editing detail (brief §H)

`field/fact → canonical owner → existing action → existing UI placement`

| field | canonical owner | existing action | UI placement |
|---|---|---|---|
| first name | `persons` when `person_id` set, else `customer_members` | `patchInquiryChildIdentityFromDrawer` (`lib/admin/drawer/inquiryChildFieldEdit.ts:130`) → `PATCH /api/admin/persons/{id}` or `PATCH /api/admin/customer-members/{id}` | Children card inline edit |
| last name | same | same | same |
| date of birth | same (person path also writes `field_values`) | same | same |
| gender | `customer_members` | `profilePatch` → `patchCustomerMemberFromInquiryChild` (`focusPanelMutation.ts:571-577`) | Children card inline edit |
| preferred name, allergies, medical notes, special instructions | `customer_members` | same `profilePatch` path (`identityInlineChildSave.ts:23-29`) | same |
| program / location | OCM (`opportunity_customer_members`) | `buildChildFocusSavePatch` → `/api/admin/opportunity-customer-members` | Children card child-edit group |
| room / schedule type / start date / days | OCM + Assignments | same, plus `/api/admin/child-participation` | Children card, linked to Assignments |
| age, display name, readiness summary | derived | **not editable by contract** — `IDENTITY_UNSUPPORTED_SAVE_REFS` (`identityFieldMutationBinding.ts:71`) | rendered read-only |
| household membership | `customer_members` (create) | `createHouseholdChildMember` — the one write authority (`lib/records/childMemberAuthority.ts`) | Add Child |

**Canonical authority exists for every field the brief names.** Stop condition 5
is **not** triggered for Child.

**The missing seam, stated exactly:** the *authorities* are case-free (both
`PATCH /api/admin/customer-members/{id}` and `PATCH /api/admin/persons/{id}`
take no opportunity), but the *orchestrator* is not.
`buildOpportunityFocusPanelMutation` (`focusPanelMutation.ts`) requires an
`opportunityId`, takes an `InquiryChildRow` (an OCM-shaped row), and dispatches
`dispatchOpportunityDrawerRecordPatch(opportunityId, …)` on both success and
rollback (lines 579-600).

So Slice 6's real work is: extract the identity/profile save path from the
opportunity-scoped orchestrator so a durable host can invoke the same
authorities with the same patch builders and its own refresh signal. The
enrollment/OCM fields legitimately keep requiring a case — they are participation
facts, not child identity, and on a context-selected durable host the case is
known anyway.

---

## Stop-condition summary

| # | condition | status |
|---|---|---|
| 1 | configured contextual cards cannot be reused outside the native Work Unit without copying | **NOT triggered.** Configuration is addressed by tenant + BP + Work View + stage/status, never by case or Work Unit. |
| 2 | context enumeration requires a second context index | **NOT triggered, conditionally.** One projection exists (`enrichSearchCandidates`). It must be *lifted*, not copied, and Employment must be added to it rather than beside it. |
| 3 | Record/Work distinction requires rewriting Search retrieval | **NOT triggered.** Three localised changes in destinations + one client branch. |
| 4 | Roster re-home requires duplicating Records state/APIs | **NOT triggered.** Components and APIs recompose unchanged; only bootstrap must merge. |
| 5 | a contextual card has no canonical action authority for editing | **NOT triggered for Child** (full authority table above). **Triggered for the Employment card** — the domain authority exists (`employmentService`), the card exposes none. Deferred to Slice 8. |
| 6 | configuration would have to be copied into a new Roster layout | **NOT triggered.** |

### The one thing to report rather than work around

**R9 stays open and should not be closed by this sprint.** A tenant cannot
publish a *child-grain* Focus Panel composition, because the Summary row is keyed
`entity_type="opportunities"` and `entity_layouts.surface` allows only
`drawer|queue|workspace`. The target experience does not need that: it needs the
durable host to resolve the **existing Enrollment/Waitlist configuration**, which
is addressable without a subject. Widening the addressing is a schema migration
and its own slice, and doing it here would be solving a problem the product is
not asking about.
