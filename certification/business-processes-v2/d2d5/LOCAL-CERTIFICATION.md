# BP V2 D2/D5: family decision vs per-child enrollment (local certification)

| | |
|---|---|
| Base | lane `50151ddda` = staging `17991d6d4` + D4 evidence |
| Stack | shared local certification stack; a fresh org per run (slug `bpv2-d25-live-*`), removed by `live-fixture-teardown.sql` (0 left) |
| Hosted defects | `qar_58463703cedd`. **D2:** "Family Enrolling" on a two-child family completed the Decision work, applied only `no_movement`, and reported no failure. **D5:** no per-child Start Enrollment; `update_child_enrollment_status` changed status but not stage |
| Not hosted evidence | Hosted proof is recorded separately |

## Root cause

**D2.** `enter_child_enrollment` is declared in `StageOutcomeRuleTargetKind` and executed by `applyStageOutcomeRuleTarget`. Its executor refuses a multi-child family with "This family has N children… Record the decision per child". But the kind was missing from the plan parser's allow-list (`TARGET_KINDS` in `stageOperatingPlanV1.ts`):
- `parseTarget` dropped it, and `parseOutcomeRule` kept the rest of the rule.
- So "Family Enrolling" ran as `[no_movement]`, reported success and completed the work. The refusal was unreachable.
- The executor and the transaction contract were correct; the plan they received was not.

**D5.** The platform already executes per-child paths (`participant_decisions` → `executeParticipantDecisionForChild`), and Firefly's published Decision uses them. The Enrollment template declared none, its command set selected none of the per-child capabilities, and nothing gated the family outcome on children being resolved. `update_child_enrollment_status` is a status command, not a stage move. The child's stage lives on its journey (`process_instances`).

**Census `gar_c036e6dd7a6c79`** (`enrollment-decision-config-census.sql`, read-only, configuration only):
- **No `enter_child_enrollment` anywhere.** No published rule in Firefly or QA Shared carries it; it was stripped before storage. So the parser repair changes no published tenant's runtime.
- **Firefly already has the per-child design.** Its Decision work is `review_child_paths`, with Begin Enrolling, Waitlist, Offer Spot, Not Enrolling and `requires_all_participants_resolved`, and its command set enables `enroll_child`, `waitlist_child` and `update_child_enrollment_status`.
- **QA Shared (the template) has none of this.**

## Repair: configuration first, one shared code fix

| Change | Where | Why |
|---|---|---|
| The parser allow-list is a `Record<StageOutcomeRuleTargetKind, true>` (adds `enter_child_enrollment`) | `lib/lifecycle/stageOperatingPlanV1.ts` | Shared boundary: a target kind can no longer be silently dropped. An omission is a compile error |
| Decision work: `participant_decisions` Begin Enrolling (`enroll_child`: status `enrolling` + `move_to_stage enrolling`), Waitlist (`waitlist_child`), Not Enrolling (reason required), copied from Firefly's; `requires_all_participants_resolved`; Family Enrolling → `[no_movement]` | `lib/businessProcessTemplates/enrollmentProcessTemplate.ts` (template-only; refuses to build if the defaults drift) | Each child progresses on its own path through the existing executor. The family outcome records intent only and is refused until every child has a path |
| The template selects the commands its stages execute plus the per-child capabilities, and drops 3 Tour helpers no registered capability executes (`send_confirmation`, `send_reminder`, `reschedule`) | `lib/businessProcessTemplates/enrollmentTemplateCommandSelection.ts`, applied by `apply_enrollment_v2_template` | The runtime refuses a per-child path whose command is not selected. Publication refuses a command set missing a referenced command, and those three can never be selected. Kept out of the template module, which would otherwise create an import cycle |

**Not changed.**
- No new command, executor, status domain, child-state writer or runtime.
- The shared default plans, the runtime fallback, and every published configuration (Firefly included).

## Live behavioural certification: `tests/businessProcesses/enrollmentPerChildProgression.live.test.ts`, 6/6

**What is real:**
- the routes: builder, publish, stage work units, status definitions, Create Lead, `child.add`, opportunity-customer-members, complete-stage-work, participant-decisions, operational-tasks, provisioning answer;
- the executors and the transaction contract;
- the production access chain.

**What is mocked:** only *who is signed in*.

**Fixture:** a fresh org, with the template applied, five child statuses configured (as in QA Shared), and a two-child family (Ava, Ben) taken Lead → Tour → Decision through the work's own outcomes.

| # | Scenario | Result |
|---|---|---|
| 1–6 | Family Enrolling, children undecided | **400**, `"Support Enrollment Decision" cannot be completed yet — 0 of 2 children decided. Choose a path for each child first.`; transaction aborted; work open; family and both children unchanged |
| 7 | Ava → Waitlist (per child) | 200, `changed: true`, no degraded effects; Ava status `waitlisted`, journey stage `waitlist` |
| 8–9 | Ben → Begin Enrolling (per child) | 200; Ben status `enrolling`, journey stage `enrolling` (status and stage agree) |
| 10–11 | Work Views | Registration (child grain) = **Ben only**; Waitlist (child grain) = **Ava only** |
| 12–13 | Isolation | Ava unchanged by Ben's decision; family stays `decision` / `open` |
| 14 | Child work | "Send Enrollment Packet" for Ben and "Review waitlist position" for Ava, each tagged to its own child |
| 15 | Ben's child work recorded as family | **400** "Child enrollment subject required for this stage outcome" |
| 16 | Not Enrolling without its reason | **400** "Reason is required."; nothing written |
| 17 | Ben's Begin Enrolling repeated | 200, `changed: false`; no duplicate journey or work |
| 18 | Actor without `work.operate` | **403** |
| 19 | Unknown decision | **400** "That option is no longer configured for this step." |
| 15–19 | Each refusal | State before and after identical: children, family, open work |
| D2 executor | Decision plan authored (Stage editor route) with Family Enrolling = `[no_movement, enter_child_enrollment]` and no gate, published; second two-child family | **400** "This family has 2 children and the decision does not say which are enrolling. Record the decision per child rather than moving them together."; transaction aborted; work open; no child status, journey or work created |
| Family completion | Family Enrolling once both children have paths | 200; family work completed; no child moved |

**Counterfactual.** The same suite on the base parser and template fails 3/6. Both D2 scenarios answer **200**, which is the hosted false success, and the per-child paths do not exist (`live-evidence-without-fix.json`).

**One configuration fact found.** A child status missing from the org's `status_definitions` is not invented. The decision reports `degraded: child enrollment status not updated: status_key is not defined…` and moves the stage only. Child statuses are separate configuration; QA Shared has all five.

## Regression

- **Template:** `tests/lifecycle/enrollmentTemplatePublication.test.ts`, 15/15.
  - Zero publish errors with a present command set.
  - The guard names every deliberate correction.
  - The parser test fails on the base parser.
- **Covering suites:** 1,841, head vs base.

| Tree | Passed | Failed |
|---|---|---|
| head | 5579 | 118 |
| base | 5576 | 119 |

**0 new failures.** The one fixed test (`roleKeyIntegrityAndGrantReplacement` M21) is environment-dependent and unrelated. An import cycle from the first layout made 73 files fail to load; restructuring into `enrollmentTemplateCommandSelection.ts` removed it, and that is what this table measures.

**Gates.**
- `npm run prebuild`: exit 0.
- Lint: 0 errors.
- Type check: scoped `tsc` was killed by the lane watchdog (exit 144) at every size; CI's Production and Full graph type checks are authoritative.
