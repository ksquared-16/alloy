# Slice 5 — Cross-Sprint Ownership Convergence · closeout

**Publication readiness: NO.** Two blockers, both named below, both owned outside Enrollment.

The headline is not a number. It is that this slice made the packet's *worse-looking* numbers
true ones: seven confident bindings instead of eight, because the eighth was a medication record
dissolving into a generic notes field behind a green "Existing field" chip.

---

## §1 — M1, the health-grain correction (D-H1)

Delivered. Full inventory, compatibility plan and reversibility proof in
[`slice-5-m1-health-grain.md`](slice-5-m1-health-grain.md).

In one line: an allergy is a fact about a child, not about an admission. `child_allergies` is now
the canonical destination; the two enrollment-grain rows are deprecated, not deleted, because they
are still the resolution path for every form already published with them; and both grains share one
`shared_value_key`, so the ask-once planner collapses them and a parent is asked once.

`medication_flag` is deprecated with **no** replacement, on purpose — medication is a Health
foundation kind and Enrollment must not build a destination for it.

## §2 — READY NOW bindings

**Seven child-profile facts** now exist as manifest rows and are seeded for every org
(`20260825120000_enrollment_slice5_child_profile_ready_now_fields.sql`, derived from the manifest
rather than hand-written): special diet, eating habits, favourite foods, foods refused, toileting
routine, nap routine, temperament. `special_diet` carries `sensitivity: "health"`; the food
preferences deliberately do not — calling a disliked food health data would make the classification
meaningless.

**Document bindings.** An upload requirement now names the document through the platform's own
classifier rather than a second vocabulary. Three of the packet's four uploads classify; the fourth
is reported as having no canonical document type instead of being forced into the nearest key.

That work surfaced a platform defect: the classifier matched keywords as raw substrings, so `form`
matched inside "in**form**ation" and typed an ACH authorization as a form-like document. Fixed by
anchoring the start of a token while leaving prefixes (`immun`, `enroll`) open. Third appearance of
this defect class in this program.

## §3 / §4 — the held concepts

Twelve facts in the real packet are now **held**, each with an explicit unresolved state:

| State | Owner | Facts | What they are |
|---|---|---|---|
| `AWAITING_HEALTH_FOUNDATION` | Health & Safety (D-H5) | 10 | 8 vaccine dose schedules, the "other vaccines" table, and the medication list |
| `NEEDS_CANONICAL_SAFEGUARDING_OWNER` | **none yet** (D-H4) | 2 | custody/visiting arrangements; a restraining order limiting contact |

`AWAITING_REQUIREMENT_EXCEPTION_MODEL` (D-H2) and `AWAITING_CANONICAL_CONSENT_OWNER` (D-H3) are
implemented and tested, and hold nothing in *this* packet: its exemption and emergency-authorization
questions arrive as acknowledgement and signature requirements, which create no durable destination
and therefore need no hold.

**The refusal is structural, not procedural.** A held proposal carries no `proposed_field` at all,
so there is nothing creatable in the object even for a caller that ignores the disposition. A hold
never refuses *reuse* — a confident match to a real destination still binds; only creation is gated.

Two design points worth keeping:

- **A low-confidence match now loses to a hold.** This is what caught the live defect: "Regular
  medications?" was binding to the generic child `medical_notes` field with low confidence, showing
  the operator a green chip and nothing to decide.
- **The eight vaccine rows are labelled `Hib`, `Tdap`, `Hep A`.** No word rule can match those, and a
  vaccine-name table is the school-specific lookup this program has refused since Slice 1. The
  *structure* says it: numbered doses of one substance. `dosis` means the form's Spanish column reads
  the same way.

## §5 — the child-profile manifest refactor

Delivered in `787c92f0f`. Adding a durable child fact was four hand-maintained lists; it is now one
manifest row, with `tests/fields/childProfileManifestDerivation.test.ts` injecting a hypothetical
field and asserting every surface picks it up.

Completing it found **three more** surfaces the Slice 4 report had not counted: the person-grain
picker shadow (which would have offered each fact twice, the second storing to the wrong row), the
profile resolver's `switch` (which enumerated the original five and answered `null` — a real "no
value" — for anything newer), and the database seed itself, which no amount of code derivation
reaches. A conformance control now fails if a manifest row has no seed, or a seed no manifest row.

## §6 — TIME: STOP

Full report in [`slice-5-time-stop-report.md`](slice-5-time-stop-report.md), including a correction
to Slice 4: the time-of-day primitive is **not missing**. `lib/workspace/alloyTimeValue.ts` holds a
settled `HH:mm` contract with parse, display and an input control. It is un-adopted, not absent.

Adding a `time` field type is seven coordinated edits, **three of which fail silently**: submission
validation breaks to no-error, the renderer returns `null` (an invisible required question), and the
participant runtime validator defaults to `ok` — a `time` type the runtime does not know accepts
`"whenever"` as a bedtime. That is the forbidden outcome reached through the front door.

Bedtime and wake time stay process-scoped text for certification. No manifest row was created for
either: a row typed `text` would assert a durable destination for a fact whose type is unsettled.

## §7 — the re-run denominator

Same corpus, same sha-pinned fixtures. 180 normalized destinations, **86 merged facts**:

| Outcome | Facts | Change |
|---|---|---|
| New field proposed (still requires approval) | 57 | −1 |
| **Held for a canonical owner** | **12** | **+12** |
| Bound to an existing canonical field | 7 | −1 |
| Relationship binding | 5 | — |
| Form-only response | 5 | — |

Plus 32 obligations (22 acknowledgements, 6 signatures, 4 uploads — 3 now carrying a document type).

The two decreases are the point of the slice. One medication fact left the "bound" column for a
hold; one collection left "new field" for a hold. Nothing was dropped: the reconciliation checker
still accounts for all 180 destinations and fails if any disappears or is counted twice.

## §8 — publication readiness

| Concept | Classification | Why |
|---|---|---|
| Allergy note (child grain) | ✅ resolved | binds to `child_allergies` after M1 |
| 7 child-profile facts | ✅ resolved | manifest rows, seeded, derived across all surfaces |
| Physician / dentist | ✅ resolved | relationship definitions (Slice 4) |
| Immunization records (10 facts) | `CAN_REMAIN_PROCESS_SCOPED_FOR_CERTIFICATION` | the parent answers on the form; nothing durable claims to own it. The CIS is also a document Alloy classifies, so the *record* has a home even while the *facts* do not |
| Medication list | `CAN_REMAIN_PROCESS_SCOPED_FOR_CERTIFICATION` | same; the previous silent binding is what was unsafe, not the question |
| Immunization exemption | `CAN_REMAIN_PROCESS_SCOPED_FOR_CERTIFICATION` | collected as an acknowledgement plus a signature — evidence, correctly, until D-H2's model exists |
| Emergency medical authorization | `CAN_REMAIN_PROCESS_SCOPED_FOR_CERTIFICATION` | same shape; the signature is evidence and is captured |
| Bedtime / wake time | `CAN_REMAIN_PROCESS_SCOPED_FOR_CERTIFICATION` | answerable as text; nothing pretends it is a validated time |
| **Custody / visiting arrangements** | 🛑 `BLOCKS_CERTIFICATION` | see below |
| **Restraining order limiting contact** | 🛑 `BLOCKS_CERTIFICATION` | see below |

Nothing is `MUST_BE_EXCLUDED`.

### The two blockers, and why they are blockers

Both safeguarding questions are `NEEDS_CANONICAL_SAFEGUARDING_OWNER` — the one state with **no owner
at all**, as opposed to waiting for a named one. That difference is why they block and the ten health
facts do not.

An immunization record sitting in a form response is *incomplete*. A custody restriction sitting in a
form response is *unsafe*: it is the answer to "may this person collect this child today", and a
process-scoped text answer is not reachable at the moment that question gets asked. Publishing a
packet that collects it would create the appearance of a safeguarding control that does not exist.

The minimum to unblock the first real certification publish is therefore **not** the Health
foundation. It is one decision: **who owns safeguarding facts in Alloy.** Once that owner exists,
even as a placeholder destination with a real reachability guarantee, everything else on this list is
already certifiable as process-scoped.

## Boundary

Not built, as instructed: H1–H4, Consent, Safeguarding, requirement exceptions, conversation
packaging. Nothing published. Participant Runtime unmodified.

Still owed from Slice 3: browser evidence for the operator review surface, blocked on manual QA
sign-in.
