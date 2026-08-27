# Real Enrollment Certification V1 — boundary, hardening debt, and the operator's remaining steps

**Run:** `erun_4fd519966ddb8618` · **Tenant unchanged — the configuration has not been performed**

## 0. Where this actually stands

I re-read the tenant first. Nothing has run:

```
draft fa0b9c36 · draft_revision 1 · status draft · validated_at null · updated_at 2026-08-18
entry_points_v1 null · requirements_v1 absent on all 8 stages
business_process_revisions 0 · process_instances 0 · description intact
```

§1 says *"the operator will use the actual product"*, and §2/§3/§5/§6 are UI actions — the packet
selection, the entry point, Validate and Publish. This lane cannot sign in, so **those steps are
yours**. What I did this turn is the one part that was mine, plus the records the instruction asked
to be made explicit.

## 1. The truthfulness rule, implemented

The five requirements will be authored `blocking` because that is their intended configuration. They
do not block anything yet: `evaluateTransitionRequirementPreflight` reads field rule ids and does not
read `requirements_v1`.

So both surfaces now say, wherever blocking is chosen and nowhere else:

> **Configured blocking; transition enforcement pending Form-requirement preflight adoption.**

A control asserts neither surface contains any way to mark a requirement satisfied. Simulating
enforcement by manufacturing satisfaction is the one thing that must never be built, so it is pinned
rather than promised.

## 2. Post-V1 hardening — recorded, not implemented

1. **Form requirements must join transition requirement preflight.** Until then `blocking` is intent,
   not behaviour.
2. **Enrolling needs canonical Enrolling → Enrolled outcome/transition configuration.** It has none
   today; Tour already demonstrates the shape.
3. **Business Process needs canonical requirement exception/waiver records.** Owner already named by
   hold `AWAITING_REQUIREMENT_EXCEPTION_MODEL` (D-H2).
4. **Exceptional outcomes need authorization and a required reason.** Today every outcome runs under
   one `record_outcome` capability.

Also recorded as stale/secondary, deliberately untouched this run: the **`Send Enrollment Packet`**
work template on Enrolling, made redundant by B1 auto-launch — it belongs in slice 2 as a
resend/share/follow-up action.

## 3. The V1 certification boundary — stated, so nothing is a silent omission

**V1 certifies:** real imported school documents · Processing interpretation · Packet Studio
configuration · BP requirement configuration · Start Enrollment realization · Participant Runtime ·
ask-once collection and confirmation · real uploads · real generated documents · per-artifact review
and signature · submission and evidence · requirement satisfaction.

**V1 does NOT certify:** Enrolling → Enrolled stage advancement · Form-requirement transition
enforcement · paperwork waiver/exception · canonical Consent · Financials/payment setup.

These are named follow-ons.

## 4. Your remaining steps

1. **Sign in** — `http://127.0.0.1:3014/login` (IP literal; `localhost` bounces you back).
2. **Organization → Processes → Enrollment → Stages.** Check the rail shows **All · Family Track ·
   Child Track**, reading *"8 stages in the whole process"* under All. If those pills are missing,
   stop — that is my track fix failing.
3. **Child Track → Enrolling.**
4. **Requirements section → Enrollment paperwork → Change paperwork → “Use a packet” → School of
   Enrichment — Enrollment Packet.** One selection compiles all five.
5. **Begin new enrollments in Enrolling.**
6. **Validate**, then **Publish**.

Then tell me and I will verify from tenant state immediately: the stored-draft diff (only the two
authorized additions plus the 14 documented normalization changes, description intact), revision 1,
the five effective requirements, and the requirement-derived packet against Studio packet
`579327c1` — 5 forms, certified order, 3 uploads, 5 signatures, 0 bank-credential asks, zero drift.

## 5. Configuration readiness

**Not yet — by exactly one thing: the operator steps above.** Everything they depend on is built and
proven: the two canonical authoring actions, the packet compile (5/5, certified order, no packet id
stored), the track switcher, the paperwork surface, and the entry-point control.

## 6. Answers to the numbered return

| # | | |
|---|---|---|
| 1 | Browser acceptance | **Not performed** — no session in this lane |
| 2 | Five stored requirements | **Not yet stored** — compile proven to produce exactly them |
| 3 | Entry intent | **Not yet authored** — `enrollment_start → enrolling` |
| 4 | Validation | **Not run** |
| 5 | Revision 1 id | **None** — `business_process_revisions` = 0 |
| 6 | Derived-packet proof | Proven from the *planned* builder; re-provable from revision 1 once published |
| 7 | Studio-vs-derived | Zero drift, previously proven; will re-prove post-publish |
| 8 | V1 boundary | §3 above |
| 9 | Configuration readiness | **NO** — pending the operator steps |
