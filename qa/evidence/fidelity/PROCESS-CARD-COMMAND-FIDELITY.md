# Process card command fidelity — audit, fix, certification

Run `erun_4bf4cf41a1a4fb22`. Slot 6, `http://localhost:3016`, org "Kurzman" enrollment department
`3933ac47-077a-4de8-aaac-8aed48d80413`.

## 1 · Where process commands are canonically authored

```
departments.metadata.lifecycle_builder_v1              published projection (publication-owned)
  processes[].stages[].stage_operating_plan_v1         THE COMMAND AUTHORITY for a stage's work
      work_templates[].primary_action.action_ref       the work's lead command
      work_templates[].helpful_actions[].action_ref    the work's supporting commands, IN ORDER
      work_templates[].outcome_refs[]                  the configured ways to resolve the work
  processes[].stages[].action_catalog_v1               stage candidate/recommendation catalog
  processes[].command_set_v1                           process-level command selection (P6.S2)
```

Authoring writes `business_process_drafts`; `trg_departments_lifecycle_projection_guard` refuses any
write to the projection that publication did not authorize. The only product path that changes
runtime configuration is `POST /api/admin/business-process/configuration/publish`.

## 2 · The production chain, as traced

```
published revision            departments.metadata.lifecycle_builder_v1, or the PINNED revision
  → governing payload         resolveOpportunityStageWorkSlice (D-96: a running journey is pinned)
  → published stage inputs    resolvePublishedStageInputsForCurrentWork  → context.publishedStageInputs
  → current stage / work      activeWorkTemplate(operatingPlan, stageWorkRuntime)
  → configured commands       resolveCurrentWorkTemplateFromPublishedPlan → templateConfig
  → registered resolution     actionsFromConfigRefs / buildWorkPrimaryAction
                              → resolveCurrentWorkTemplateAction → the registered action spine
  → eligibility               resolveCurrentWorkActionExecution (executable | disabled | blocked |
                              configuration_error | hidden), reusing the ActionBlocker vocabulary
  → canonical treatment       resolveCurrentWorkActionButtons (dominant / helpful / subordinate)
  → THE PROCESS CARD ROW      projectProcessCardCommands → ProcessCard
  → execution                 planCurrentWorkActionExecution → the shared command workspace /
                              the record command host
```

## 3 · What was causing production to diverge

`BusinessProcessCard.tsx` read **`context.recordHeaderActions`** — `subjectVm.actions.record_header`,
the registry's generic record-header slots, resolved from what is executable for the record. Nothing
in that list is aware of the published Business Process. The card therefore:

* offered commands the configuration never selected,
* in the registry's order,
* with prominence the card invented (`primary: i === 0`),
* while the configured commands were **absent**.

The two responsibilities were reversed: the platform was choosing the set and the configuration was
never consulted.

A second, dependent defect: `business_process` supersedes `current_work`, so a published layout
composes no `current_work` cell. A command that opens a capability asks for the Current Work command
workspace, and that request resolved to a key no cell answered to — **"Reschedule Tour" opened
nothing at all.**

## 4 · The ownership boundary

| Question | Owner |
|---|---|
| Which commands belong on this card | Business Process configuration (published revision) |
| In what order | Business Process configuration |
| Which one leads | Business Process configuration (`primary_action`) |
| Can it execute right now | Action / capability platform |
| Disabled, blocked, needs input | Action / capability platform |
| Where it executes | The shared command workspace / record command host |
| A configured key that is not registered | Reported as configuration drift; never substituted |
| An executable command nobody configured | Withheld; never rendered |

## 5 · Configured vs rendered — side by side

Subject `8b3689fb-130f-4019-89a4-433a1fd53735` (PassA Kid, Kurzman family), stage `waitlist`,
work template `review_waitlist_position` (`primary: true`).

**Published configuration** (`published_stage_inputs.operatingPlan`, read from the runtime's own
provisioning answer):

| # | slot | action_ref |
|---|---|---|
| — | primary_action | *none configured* |
| 1 | helpful_actions | `send_tour_invitation` |
| 2 | helpful_actions | `schedule_tour` |
| 3 | helpful_actions | `quick_message` |
| 4 | helpful_actions | `send_form` |

**Rendered on the card, after the fix:**

| # | label | prominence | state |
|---|---|---|---|
| 1 | Send Tour Invitation | secondary | executable |
| 2 | Reschedule Tour | secondary | executable |
| 3 | Message | secondary | executable |
| 4 | Send form | secondary | executable |

Exact match, in configured order. `Reschedule Tour` is the configured `schedule_tour` under the
platform's own booking-state alignment — it still carries `actionRef: schedule_tour`. No command
carries the filled lead treatment, because the work template configures no `primary_action`; the
card does not invent one.

**Withheld:** `cancel_tour` — a companion the booking-state rule ADDS when a tour exists. It traces
to no configured ref (its ref is a booking id), so it does not go on the row. Recorded on
`window.__ALLOY_PROCESS_COMMAND_WITHHELD`.

**Drift:** none.

**Rendered on the same card, BEFORE the fix** (`git checkout a4819964a~1 -- BusinessProcessCard.tsx`,
same subject, same session):

| # | label | prominence | configured? |
|---|---|---|---|
| 1 | Update Lead Status | **primary (filled)** | no |
| 2 | Reschedule tour | secondary | — |
| 3 | Change lead location | secondary | no |

Three commands, two of which the process never selected, and three configured commands missing.

### Second stage — the pressure test

Subject `b5b62172-8b27-44ff-a852-b11b8888a6cd`, stage `enrolled`. Published configuration:
`work_templates: []` — nothing configured.

* Before the fix: **Move to qualification** (filled primary), Update Lead Status, Schedule Tour,
  Change lead location — a lead-pipeline command offered as the primary action on an enrolled family.
* After the fix: **no commands**. Nothing is configured, so nothing is offered.

## 6 · Execution proof

Clicking **Message** on the card opened the shared communications composer ("Compose New · Choose a
linked contact for this record") — `quick_message` resolving through
`planCurrentWorkActionExecution` → `communications_composer` → the record command host.

Clicking **Reschedule Tour** opened the shared Current Work capability panel, headed
`HELPFUL ACTION · Reschedule Tour`, carrying the live booking (`Confirmed · Aug 14, 2026, 9:00 AM
America/Los_Angeles`) and the `Reschedule tour` control. The panel's own label states the
provenance: it resolved to a configured **helpful action**, not a header action.

Evidence: `exec-message.png`, `exec-resched2.png`.

## 7 · Publish-only configuration change

Through the canonical path — `POST /api/admin/enrollment-process/stage-runtime-config` (draft), then
`POST /api/admin/business-process/configuration/publish` (revision 19, `5724629a-…`):

`review_waitlist_position.helpful_actions` changed from
`[send_tour_invitation, schedule_tour, quick_message, send_form]` to
`[send_form, send_tour_invitation, schedule_tour]` — a reorder **and** a removal.

**No Process-card code changed.** Reloading the same queue:

| waitlist row | rendered commands |
|---|---|
| 0 (pinned journey) | Send Tour Invitation · Reschedule Tour · Message · Send form |
| **1 (unpinned journey)** | **Send form · Send Tour Invitation · Reschedule Tour** |
| 2–5 (pinned) | Send Tour Invitation · Reschedule Tour · Message · Send form |

Row 1 follows the new publication exactly: the reorder landed and `quick_message` is gone. Rows 0
and 2–5 are pinned to the revision their journeys started under and correctly did not move — D-96,
Class-A configuration, which is also the production proof that **draft or later configuration cannot
reach a card governed by a published revision**.

Evidence: `publish-proof-unpinned.png`, `publish-proof-pinned.png`.

**Restored.** `helpful_actions` returned to `[send_tour_invitation, schedule_tour, quick_message,
send_form]` and republished; row 1 re-verified back to the intended four.

## 8 · Guards

`web/tests/adminV2/runtime/processCardCommandFidelity.test.ts` — 11 assertions:

* an executable, registry-offered, unconfigured action never appears;
* a runtime companion the configuration never selected is withheld, while the configured command it
  was derived from stays;
* no published revision → no commands (fail closed; the record-header list is not a substitute);
* configured order survives provider → evidence → card;
* exactly one command carries the configured lead prominence;
* configured identity survives an `override_label` (never matched by label);
* an unregistered configured ref is reported as drift, not silently omitted;
* draft configuration beside a published payload changes nothing;
* two published command sets produce two different rows;
* no domain/process key in command selection in the projection, the provider, or the card;
* the provider does not read `recordHeaderActions` (the positive control for the whole file).

## 9 · Regression

* New suite: 11/11.
* `businessProcessProvider`, `businessProcessParticipantRail`, `tests/surfaces`,
  `tests/operationalCards`, `currentWorkCenteredHost`: pass.
* Nine suites in the blast radius carry **15 pre-existing failures**. Failing-test list captured at
  `HEAD` and at `a4819964a~1` (this run's baseline): **identical — 0 introduced, 0 fixed.**
  Two further pre-existing failures (`currentWorkOperationalSurface`, `currentWorkCommandIntegrity`)
  were confirmed the same way.
* `vac run typecheck` → rc=0.
* Design lab renders with zero page errors.

## 10 · Commits

| sha | subject |
|---|---|
| `a4819964a` | the command row is the published configuration's, not the registry's |
| `05212f1e9` | admit a command only when it traces to a configured ref |
| `aae7bb150` | make the shared command workspace reachable from the successor cell |
