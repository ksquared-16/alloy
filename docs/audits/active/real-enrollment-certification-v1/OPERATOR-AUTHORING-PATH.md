# How to author and publish revision 1 — no DevTools

**Run:** `erun_7ea4d9e6831736cd` · Control built and tested · Tenant untouched

You were right to reject the console snippet. The actions existed and nothing could invoke them,
which meant the honest answer to *"how does an operator use this"* was "paste JavaScript" — that is
not an authoring surface. It is built now.

## What was added

A narrow control inside the **Requirements** section of the stage editor you already use — Form
requirements sitting beside field requirements, because they answer the same operator question and
differ only in what the requirement references.

It owns nothing. It composes the two canonical actions on the existing lifecycle-builder route, sends
your session so the route's own authorization applies, and prints the route's refusal verbatim rather
than restating the rule somewhere new. No second store, no second validator, no publish path of its
own — publication stays the existing bar at the top of the same screen.

Three details that carry meaning:

* Requirement identity is derived from the form it references. The section is *replaced* on each
  save, so a random id would make an unchanged requirement look new every time.
* An authored-empty stage reads *"an authored decision, not a gap"* — the D-90 distinction between
  "requires nothing" and "not configured yet", which otherwise never reaches a screen.
* With no entry stage set it says Start Enrollment will refuse, because that is what happens.

`scope` is fixed at `record` and `timing` at `stage_exit`, said out loud rather than hidden — `record`
is the only scope the readiness evaluators implement today. `level` and `enforcement` are yours to
set; a newly added form defaults to the certified `required` / `blocking`.

## What to do

**1 — Sign in.** `http://127.0.0.1:3014/login` — the IP literal, not `localhost`; the auth cookie is
scoped to it and `localhost` silently returns you to the login page. Use the isolated alloy-cert QA
operator.

**2 — Open the process.** `http://127.0.0.1:3014/organization/processes` → the **Enrollment** process
→ the **Enrolling** stage.

**3 — Open “Requirements.”** It starts collapsed. Under the field requirements you will find
**“Forms this stage requires.”**

**4 — Add the five, in this order.** Each from the *"Add a published form…"* picker:

1. Oregon Certificate of Immunization Status
2. Oregon Nonmedical Exemption
3. School of Enrichment Admissions Packet
4. Tuition & Enrollment Agreement
5. Parent Handbook Acknowledgement

Leave each at **required / blocking**. Then **Save requirements**.

**5 — Set the entry point.** Just below: **“Begin new enrollments in Enrolling.”**

**6 — Publish.** The **Business Process publication bar** at the top of the same stage editor —
Validate, then Publish. That is the existing canonical publish route; nothing new.

Then tell me it is done and I will verify §7–§9 from the database: the stored draft diff, revision 1,
the requirement-derived packet against Studio packet `579327c1`, and the readiness verdict.

## Unchanged

The configuration is exactly what was approved — `enrollment_start → enrolling` plus the five
certified Form requirements on `enrolling`, all `kind: form` at `required · record · stage_exit ·
blocking`. No Direct Payment Authorization, no `create_lead` mapping, no other stage touched.

Pre-state re-verified at the start of this run and untouched since: draft `fa0b9c36` ·
`draft_revision` 1 · revisions **0** · instances **0** · `entry_points_v1` null · `requirements_v1`
absent on all 8 stages · process description intact.

## Verification

14 controls on the new component, plus the 20 on the actions beneath it. The component controls
render to a string — this suite has no DOM — so they assert structure and copy, not clicks, and are
labelled that way. 84 pre-existing lifecycle failures unchanged, **0 newly broken**. Capability
ratchet green. `typecheck:tests` rc=0.

Browser verification of the control itself is still owed and is the same sign-in: when you open the
stage editor you will be looking straight at it.
