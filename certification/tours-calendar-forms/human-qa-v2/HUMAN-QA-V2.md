# Human QA V2 — Marketing consent question, Mac mini QA guide, website installation

Sprint `OPWORK_2CEA84351D90_SPRINT_ECF57F9133D9` (established `gar_d1f917b59ba164`), run `erun2_8a2a3318f500d7a2`,
branch `sprint/tours-human-qa-v2` from staging `bce2364ab` (#1613). No push, PR, merge, deployment, staging
migration or release request. Record only.

## Commits

| Commit | What |
|---|---|
| `b9fff0575` | Forms Studio: first-class Marketing consent question bound to Communications consent |
| `71a4b98a5` | `/dev/tours-qa` guide + results checklist; QA parser links and A–Z labels |
| `b84a37a3d` | Guide: TS2783 fix (caught by typecheck) |
| `927707010` | Studio Preview renders the consent question as the families' control (browser-found defect) |
| `481657775` | Owner docs (Forms, Communications) + guide corrected from browser runs |

## Isolated QA environment (governed)

| Request | Action | Result |
|---|---|---|
| `gar_c5af13ba211f57` | build baseline at `bce2364ab` | failed `base_not_target_tip` — staging moved to `b30914e34` (#1615, no migration change) |
| `gar_90db3b9eac8fbd` | build baseline at `b30914e34` | `certenv-7048d30add`, 550 migrations, loopback-only |
| `gar_8f1fe4449d764d` | activate preview `alloy.candidate.enrollment` = `b84a37a3d`, isolated, production | ACTIVE, production build certified; no Resend/Twilio credentials in the preview env |
| `gar_a72db2273e3097` | restore preview QA session | storage state fresh |

Guide URL: `https://vacilandos-mac-mini.tail2aa1af.ts.net:4412/dev/tours-qa` — HTTP 200 over the tailnet and loopback;
browser-navigated at 1440 and 390 px (66 tests, statuses persist across reload, Markdown export downloads).

## Browser evidence (isolated preview, synthetic Northwind tenant, `*.invalid` addresses)

| # | Check | Result |
|---|---|---|
| D2 | + Add question → Answer types → Capture → Marketing consent | question "Stay in touch (optional)", 2 unchecked boxes, tag *Marketing consent · Optional* (`s4-consent-added-edit.png`) |
| D3 | Inspector | *Always optional*, no destination, channel toggles, per-channel wording, version line |
| D4 | Rewording changes the version | `form_field.v1:95d6de48` → `form_field.v1:9c83012b` |
| D5 | Untick SMS | SMS leaves the canvas |
| D6 | Adding it again | still 1 question (selects the existing one) |
| D7 | Alloy fields search "opt" | *No fields match your search* (`s4-library-search-opt.png`) |
| D8 | Studio Preview | **DEFECT** — drawn as a text box (`s5-preview-defect-before-fix.png`); fixed in `927707010`, regression test fails on the pre-fix Preview. Browser re-check on the final preview is pending (below). |
| D9 | Publish | header *Published* with Copy link / Copy iframe / Open runtime / Manage distribution / Republish |
| E5/E6 | Form-first, embedded on `https://qa-school.example` | 1 consent control, authored id + version, in place between *Date of birth* and *Parent / guardian first name*, unchecked (desktop, 390 px); submit body `marketing_consent {email:true, sms:false}`, no consent value in `values` |
| E1–E4 | Tour-first, embedded | calendar → 8 AM/PM times → Continue stays in the frame; step 2 *Requested tour … not confirmed*; **exactly 1** consent control = the authored question, no default "Stay in touch" (desktop, 390 px); submit `{email:false, sms:true}` + requested tour; *Your tour request was received … not confirmed yet* |
| G2 | Case evidence, Approve | before: *Email news: yes — Not applied yet*, *Captured … · wording form_field.v1:9c83012b*; after: *Recorded as opted in* / *Nothing recorded — no consent given*; Approve `committed` email `opted_in`, sms `skipped_unset`; person email_marketing `opted_in` (public_intake) |
| B | Marketing email to opted-in person | 200 `sent_to_queue` (isolated DB, no provider) |
| G11 | Marketing SMS, no phone | 409 `blocked` `no_usable_phone` |
| G13/G14 | After operator opt-out, marketing email | 409 `blocked` `eligibility_blocked:OPTED_OUT` (an identical earlier body returned `duplicate` — dedupe, not a pass) |
| G5 | Repeat inquiry ticking email after opt-out | Review matches → *Same child* → *Approve — Link existing*; case *Not applied — the person had opted out; the opt-out stands*; Approve `preserved_opt_out`; person still `opted_out`; history `public_intake opted_out->opted_out` |

## Tests and builds

| Check | Result |
|---|---|
| New: `marketingConsentFormField.test.ts` (25), `marketingConsentFieldRender.test.tsx` (5), `toursHumanQaGuide.test.ts` (6) | pass; planted mutations (channel gate; pre-fix Preview) fail them |
| Related suites (consent, tours P1, processing identity, forms engine/studio, field library, public calendar/forms) | 358/361; the 2 `publicFormsRoutes` reds fail identically with the base resolve payload |
| Broad: tests/forms, communications, tours, qa, publicForms, pos | 5507 passed, 63 failed, 1 skipped — all 63 fail identically (same 33 files, same counts) on base `bce2364ab` (probe worktree) |
| `vac run typecheck` / `typecheck:tests` | PASSED (after the TS2783 fix) |
| `npm run prebuild` (6 guards) | exit 0 |
| `vac run build` | pending — host memory below the build's predicted peak; filed with Vacilando |

## Not done / blockers

- `vac sprint commit-slice` refused `run_not_attributed`: the run predates the sprint and two VERIFIED sprints are
  still open. Attribution is the Gateway's.
- Retiring this lane's stale `certenv-8b1a2284d8` (548 migrations, lease expired, no preview) was not authorized here.
- Provider delivery (guide Part H) was not exercised: no message was sent to any real inbox or phone.
