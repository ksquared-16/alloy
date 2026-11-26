# REAL ENROLLMENT CERTIFICATION V1 — CONFIGURATION CERTIFIED

**Run:** `erun_f211be8c6a8204f6` · Revision 1 published · Parent journey created and **untouched**

## Revision 1

| | |
|---|---|
| Revision id | **`15f3126a-3768-4241-aecc-a486bec9baf6`** |
| Revision number | **1** (exactly one published revision) |
| Publication id | `b7af5e98-4cee-4686-ba7f-2c8d635e67e4` |
| Published at | 2026-08-26T17:16:53Z |

All twelve pre-publish preconditions passed before writing: revision 3 · 0/0 validation · 8 stages ·
4 Family / 4 Child · split rules on decision + tour · no family→child transitions · three closes →
`lost` · no manufactured command set · entry point set · five requirements · no other stage carries
them · description intact.

**Immutable payload vs validated draft:** differs by exactly 7 lines, all of them the documented
publish-time normalization (`requirements_v1` materialized from legacy **field** rules on the seven
stages where canonical was silent). **`enrolling` is untouched — still 5 × `kind: form`.** The guarded
`lifecycle_builder_v1` projection equals revision 1 byte-for-byte.

## Runtime derivation from Revision 1 — zero drift

```
enrollment_start → enrolling → 5 form requirements → derived packet
5 forms · 3 uploads · 5 signatures · 0 bank-credential asks
```

Derived packet key `bp_rev_15f3126a37684241aecca486bec9baf6_enrolling` — it names revision 1.
Order preserved · form identities equal · **exact published versions equal** · **PACKET DRIFT: ZERO**
against Studio packet `579327c1-c661…`.

## The real parent run — created, not consumed

| | |
|---|---|
| Household | `00000000-…-100000000001` (Test Family 0001) |
| Child | **`e79c8638-d3c3-4a27-99b4-04a420687855`** — "Certification Child", DOB 2021-04-12, created via the canonical `addChild` (`identityOutcome: created_new`) |
| Process instance | **`b81733b1-1188-4010-a0e0-dd675f25f5b0`**, pinned to revision `15f3126a…` |
| Derived packet | `dcb354a1-6a57-4265-b351-698924609557` |
| Session | **`b25caf02-8c54-4f16-a62c-e27a0928299c`** — `in_progress`, `current_sequence_index: 0`, `shared_values: {}` |
| Public link | `4c8b26e4-9281-4f6c-995d-486b95c99151` — active, no expiry |

**Verified:** 1 process instance · 1 session · 5 session items · **0 submissions** · 0 payment
methods · 0 safeguarding rows · nothing duplicated.

**All five session items resolved the exact certified versions** — `53c3fea8`, `3b7a5964`,
`fa4aa129`, `dec4a61d`, `13345527` — each equal to the Studio pin.

## 🔗 The untouched parent URL

```
http://127.0.0.1:3014/forms/embed/7Nl7-E6yGaPq7iTtON-Yk5v6ba5lkLC65EVjJ_3Itmk
```

I have not opened it.

**Expected first turn:** step 1 of 5, *Oregon Certificate of Immunization Status* (`status: active`,
the other four `pending`). It carries **1 upload** and **2 signatures**. Nothing is prefilled —
`shared_values` is empty, so the first turn is where ask-once starts accumulating.

## Two details worth knowing before you start

* **`process_instances.stage_key` is `null`.** By design — `startEnrollment` deliberately stamps no
  stage ("the journey's configured entry decides position"), and the entry point resolves `enrolling`
  at launch. The launch confirms it: `stageKey: "enrolling"`.
* **`opportunityId` is `null`, `contextOutcome: context_free`.** The household has no live enrollment
  episode, which is a legitimate path — context is joined only when one exists.

## Known limitations during the run

1. **Collection is step-wise**, form by form in packet order, with shared values carried forward —
   not one semantic questionnaire. Ask-once means *not re-asked*, not *asked once up front*. (R1.)
2. **`enforcement: blocking` on the five requirements is configured, not enforced.** The transition
   preflight does not yet read Form requirements.
3. **Nothing advances the child to Enrolled.** V1 ends at paperwork completion and evidence.
4. **No waiver path.** Skipping paperwork is not expressible yet.
5. The **Direct Payment Authorization** artifact is deliberately absent — payment setup is deferred to
   Financials.

## The V1 boundary — unchanged

V1 does **not** certify: Enrolling → Enrolled advancement · Form-requirement transition enforcement ·
requirement waiver/exception · canonical Consent · Financials/payment setup · R1 Semantic Packet
Runtime · R2 Packet Readiness · R3 sibling ask-once.

## Not done

Publishing is complete; the parent interaction is yours. I did not open the link, submit anything, or
touch the session.
