# BP V2 D1: hosted certification in QA Shared

| | |
|---|---|
| Deployed build | `91ee6721b78e` (PR #1577 squash; `/api/build-info` at 10:34:42Z) |
| QA run | `qar_43db70ca2b00`, plan `bp_v2`, opened by `gar_ad1808069d18cf` (11:33Z), closed by `gar_5d5bc1dc9a3e1b` (11:48Z) → **QUIESCED_RETAINED**, `access_clean: true` |
| Residue census | `gar_07c4153d995320` (11:49Z, after the close), **13/13**; bound with `gar_bfc69cdb8806f1` |
| Writes | **One.** `POST …/configuration/publish` on QA Shared Enrollment (department `7c1ac953…`); the draft was the published revision 2, so `already_published: true`. Its effect was the provisioned override. No records, fixtures, sends or financial activity. Every browser pass aborted all other non-GET requests. |

## 1. Provisioning on the deployed build (`provision.json`)

| Step | Result |
|---|---|
| Effective opportunity drawer layout, before | global `record_layouts` default `0680209d…`, `inquiry_drawer_mode` **null** (version 1) |
| Validate | 200, 0 errors |
| Publish | 200, `opportunity_drawer_override: { status: "provisioned", processKeys: ["enrollment"] }` |
| Effective layout, after | org override **`16c5344a…`**, `inquiry_drawer_mode: "workflow_v1"`, version 3. Its keys are exactly the seed default's. |
| Publish again | 200, `already_present` (id `16c5344a…`); effective layout unchanged |

## 2. Enrollment records in the browser (admin, `walk-admin.json`)

| Work View → row | Focus Panel | Drawer view-model |
|---|---|---|
| Decision → Walk 584637 Family | `record`, no classic message. Enrollment timeline (Ben, Cara at Placement / Decision; Ava at Waitlist), **Placement / Decision** card, last action, Message / Send form, Household, Children (`decision-family-focus-panel.png`) | 200 |
| Waitlist → Ava (waitlisted child) | `record`. **Waitlist** card ("Manage waitlist candidates and spot offers"), Financials (responsibility $50.00, balance $0.00), Household (`waitlist-child-focus-panel.png`) | 200 |
| All → Walk 584637 Family | `record`, same as Decision | 200 |

Before D1 every one of these answered `classic_layout_deferred` ("This inquiry drawer uses a classic layout…"); that was the 8B-2 blocker.

**Assignments, unchanged from 8B-2.** Its 5 views render: Current 3, Ending soon 0, Upcoming 1, Gaps 1, Proposed 4. The first row of each opens in `record` state.

**Billing, unchanged.** Its 5 views render, with 0 rows because the 8B-2 charges were quiesced.

**Known HTTP errors.** The run hit the 404s already recorded: `financial-config/opportunity/<member>` (D6) and two `option-sets` lookups.

## 3. D3: closed record (`d3clean-admin.json`, `d3clean-director.json`)

The probe navigated directly to `/workspace/work-unit/all?subject_id=de17caff…` with no clicks. That record is the 8B-1 readiness family, closed as Lost, at stage `closed`, which has 0 work templates.

- **Readable: PASS, for admin and Director.**
  - Drawer view-model: 200.
  - Panel state: `record`.
  - Panel content: the header ("Closed · QA North"), the Enrollment timeline, a **CLOSED** card ("No current work configured · Family enrollment case is closed"), last action *Not Interested*, "1 CHILD all at Closed", and Household.
- **Server answer (unchanged from local).** The Work View provisioning answer for that subject is still `terminal: error`, `no_truthful_primary_action`. The panel does not depend on it; the view and its rows render.
- **Correction to the local verdict.** The local run concluded D3 was a blocker from that server answer alone. In the browser it does not block reading the record.
- **New defect D8.**
  - **What happens:** opening the closed record, with no click, also opens an Assignments **"Create Assignment"** editor for its child over the panel (`closed-record-director.png`).
  - **Why it's wrong:** a closed, lost family should lead with its closed state, not with assignment creation.
  - **Writes:** none; the editor's submit is disabled until configured, and the probe aborted all writes.
  - **Status:** Focus Panel behaviour; not repaired here (stop condition: no Focus Panel redesign).

## 4. Close and census

| Check | Result |
|---|---|
| `bp_qr_pool_access` (non-actor access zero) | true |
| `bp_qr_zero_sent` | true |
| `bp_qr_org_exists` | true |
| 10 financial checks: no merchant, no usable method, no autopay, no provider activity, no active schedule, no draft, no open balance, no open variance, no unapplied money, all attributed | true ×10 |

Retained by design: 4 posted charges, plus the published configuration (4 publications), which now includes the provisioned drawer override.
