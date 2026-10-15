# Form lead capture → Processing acceptance → Enrollment lead

A lead created from an approved public-form submission is the **same canonical Enrollment lead** as a
lead created through BOS → Create Lead. This page states the contract and where each part is owned.

## The two doors, one commit

| | BOS → Create Lead | Public form → Processing → Approve |
|---|---|---|
| Case opened by | `ingestCreateLeadThroughProcessing` | `ingestPublicFormThroughProcessing` (`source_adapter: public_form_v1`) |
| Identity review | in BOS (operator confirms) | in Processing (Review matches) — never at raw submission |
| **Placement** (owning work unit, entry status) | `resolveCreateLeadPlacement` before the case opens → `create_lead_intake` | `resolveCreateLeadPlacement` in the plan builder when the case has no `create_lead_intake` |
| Location | the operator's choice | the family's choice on the form, else the campus of the location-specific link it came through (`default_location_id`) — `formIntakeLocationId(intake_meta)` |
| Commit | `commitApprovedLeadForCase` (build → approve → execute) | `commitApprovedLeadForCase` |
| Unplaceable | 422 "Create Lead is not configured…" / "More than one process…" | the same messages, `lead_placement_unresolved` → 422 |
| Activity | `action_executed` / `create_lead` on the lead | `action_executed` / `create_lead`, plus `source: public_form`, `processing_case_id`, `form_submission_id` |
| Handoff | `work_view_id` / `work_view_route_key` via `resolveCreateLeadWorkViewForHandoff` | the same, on `operationalResult.handoff` |
| Open Lead | `resolveOpenLeadFocusPanelHref` + `openCreatedLead` | the same |

There is one placement owner (`web/lib/lifecycle/resolveCreateLeadPlacement.ts`) and one commit owner
(`commitApprovedLeadForCase`). Neither door has a private copy.

**Why this mattered.** Before convergence, the form path never resolved placement, so its lead committed
with `work_unit_id` NULL. Work-unit and location-scoped operators could not see it (their membership
excludes NULL), and Open Lead fell back to the workspace home. Measured on staging: Ravi Smith / Kai Ravi,
case "Smith Family", `work_unit_id` NULL, compared with a BOS control lead carrying its Enrollment work unit.

Both doors persist the create-lead command's status (`new`) at stage `lead`. Neither creates a process
instance at intake; the child journey begins at the family decision (see `BUSINESS-PROCESS-ENTRY-STAGE.md`).

Intake reads each submitted value through the published question's **canonical binding**
(`field_source.crm_mapping_key`, e.g. `child.date_of_birth`), then the default field ids. The link's
explicit `intake_field_paths` override both.

## After Approve: an acknowledgement, not an auto-advance

`ProcessingLeadAcknowledgement` stays until the operator chooses. Processing never moves to the next item
on its own. (It used to auto-advance 3.2 s after approval, which took the operator away from the lead
before they could open it.)

| Action | Destination | Mechanism |
|---|---|---|
| **Open Lead** (primary) | the lead's Focus Panel in the Work View the server placed it in | `openCreatedLead` → `dispatchOperatorFocusSelection` |
| Contact Family | the same panel, Communications card | `card_focus: communications` |
| Update Information | the same panel, Household card | `card_focus: household` |
| Open parent / Open child | the durable record | `useOperatorRecordFocus({ intent: "durable_record" })` |
| Next Item | the next open case, chosen at the moment of the click | in place; "No more items waiting" when none |
| Return to Queue | the rail with no case selected | in place, no reload |

Only destinations that exist for the committed records are offered. A **matched** family reads "Lead added
to an existing family … No new family was created". `operationalResult.createdRecords` says, per record,
whether it was created or linked, and `matchedExisting` summarises it. Presence of an id no longer means
"created".

## Incoming and the category folders

Incoming holds **every open case** (`received`, `processing`, `needs_review`, `needs_resolution`, `ready`),
whatever its category. Category folders (Enrollment, …) are overlapping lenses over the same open cases, not
a partition: an open enrollment submission sits in Incoming and in Enrollment, and leaves both for Completed
when it is approved.

The Incoming and Completed badges read the org-wide status counts the queue endpoint returns
(`processingStatusFolderCounts`). Category badges count loaded rows. They used to count the 25 loaded rows,
so Incoming stopped at 25 and a new submission never moved it.

## Evidence

- `tests/lifecycle/resolveCreateLeadPlacement.test.ts`: the placement rules, and the source guard that BOS
  and the plan builder both use the one owner.
- `tests/processing/processingIdentityD3Operator.test.ts` → "public form intake": the form lead's work unit
  and location reach the opportunity port through `commitApprovedLeadForCase`; it fails closed when
  unconfigured or ambiguous; a BOS intake still wins.
- `tests/pos/formLeadAcknowledgement.test.ts`: the acknowledgement view, the matched variant, no
  auto-advance, canonical focus paths, and the badge counts.
