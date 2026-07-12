# Alloy OS — Operational Workflow Validation

**Path:** `docs/sprints/06_2026/alloy_os_operational_workflow_validation.md`
**Status:** **FINAL DESIGN PRESSURE TEST — Runtime complete (pending sign-off)**
**Primary artifact:** Cursor Canvas `operational-workflow-validation.canvas.tsx`
**Date:** June 2026

> Runtime frozen. No redesign. No implementation. No new runtime primitives. Final validation before Configuration Runtime.

---

## Operational question

Can a childcare director operate **Enrollment**, **Billing**, **Scheduling**, and **Attendance** using exactly the frozen runtime?

**Answer: Yes.**

---

## Deliverable 1 — Enrollment lifecycle

**Pipeline:** Lead → Tour → Decision → Enrollment → Enrolled

Each stage uses the same runtime. Stage changes are **Mission + card composition** (Business Process + Experience Builder) — not new primitives.

| Finding | Verdict |
|---------|---------|
| Missing runtime primitive? | None |
| Awkward? | Grain switch (family ↔ child) uses frozen Subject cross-fade — not new |
| New primitive? | No |

---

## Deliverable 2 — Enrolled child (Emma Wright)

First major proof. Director opens Emma (child grain). Summary composed entirely from Universal Cards (Concept B grid).

| Question | Card |
|----------|------|
| Room / schedule | Schedule & Room |
| Program / start / transition | Program & Transition |
| Attendance today | Attendance Today |
| Billing status | Billing Status |
| Primary guardian | Household & Guardian |
| Current work | Current Work |
| Upcoming events | Upcoming Events |
| Medical / readiness | Readiness / Health |
| Documents | Documents |

Mockup in canvas.

---

## Deliverables 3–5 — Billing · Scheduling · Attendance

Each domain composes Summary (Concept B grid), Work (action chips + workbench), Activity (horizontal timeline + Communications embed + supporting cards) from frozen card system.

No new runtime primitives in any domain.

---

## Deliverable 6 — Runtime validation summary

| Domain | Reused platform cards | Domain bindings (config) |
|--------|----------------------|-------------------------|
| Enrollment | Attention · Work · Readiness · Household · Children · Timeline · Comms · Docs | Tour · Decision · Placement |
| Enrolled Child | Work · Attendance · Billing · Schedule · Guardian · Docs · Readiness | Events · Transition |
| Billing | Attention · Work · Household · Timeline · Comms · Audit | Balance · Payment · Funding · Invoices |
| Scheduling | Attention · Work · Children · Timeline · Comms | Room · Teacher · Conflicts · Transition |
| Attendance | Attention · Work · Pickup · Timeline · Comms · Docs | Check-in/out · Health · Incident |

Communications = embed module (Activity slot). Workflows = Actions/Workflow. Fields = Field System. Layouts = Experience Builder.

**No new runtime primitive identified.**

---

## Deliverable 7 — Universal card engine scale

Same card engine supports Household, Billing, Attendance, Scheduling, Health, Transportation, Meals via blueprint bindings — not new card runtimes.

---

## Deliverable 8 — Configuration validation

| Element | Platform | Configuration |
|---------|----------|---------------|
| Runtime spine + Focus Panel + Card anatomy | Platform | — |
| Mode layout + card composition | Platform engine | Experience Builder |
| Card visibility + mission rules | — | Business Process + EB |
| Field widgets | Field System shell | Field System + EB |
| Work launcher + actions | Platform action path | BP + Actions/Workflow |
| KPIs | Metric card shell | Analytics |
| Communications embed | Platform slot | Communications platform |

---

## Deliverable 9 — Final runtime verdict

## **The Runtime is considered complete.**

**Missing platform primitives: None identified.**

Everything after this moves into **Configuration Runtime**.

---

## Awkwardness (not blockers)

- Child vs household card density → EB layout variants
- Communications embed richer than other Activity cards → frozen embed slot
- Bare mockup card bodies → Field System + EB configuration

---

## Stop line

Do not redesign. Do not implement. Do not add runtime primitives. Next: Configuration Runtime.
