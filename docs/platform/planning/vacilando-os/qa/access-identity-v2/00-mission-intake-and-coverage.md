# 00 — Mission intake & discovery coverage

> **Intake report** for the Access & Roles mission. Establishes what the operator actually
> asked for, what the compiled mission asked for, why those differ, and how much of the
> requested discovery already exists.
> Read before executing any phase of `msn_2d054741a54698fa4c`.

**Mission** `msn_2d054741a54698fa4c` v1 · phase `p1` · assignment `asg_56508f92881d3d`
**contentHash** `2c0b0b8fee88469de91e37587a3bb242`
**Worktree** `wt6-vacilando-os-product-def` @ `agent/claude/6-vacilando-os-product-def`
**Date** 2026-07-30
**Method** static, file-grounded; mission state read read-only from the running Director on `127.0.0.1:3021`.

---

## 0. Headline

**The mission was dispatched in a form that cannot be executed as written, and the work it
asks for is ~60% already done.** Two independent problems:

1. **The compiled phase contradicts the brief.** The operator's brief says, in its own words,
   *"The Director should not begin implementation immediately"* and *"Do **not** ask Vacilando
   to build V2 immediately"*. The compiled phase `p1` has `kind: "implement"`.
2. **The phase objective is a 69-character truncation.** `p1.objective` is the elided title
   string, not the brief's objective. The scope, required outputs, and acceptance criterion
   that a worker needs were never populated.

Neither is a judgment call; both are reproducible from mission state (§1, §2).

The brief's real ask — *"Discover and specify Access & Identity V2"* with **twelve named
outputs** — is largely satisfied by the existing corpus in this directory. **Seven of twelve
outputs are complete, two partial, three absent** (§3). The absent three are the mission.

---

## 1. What the operator asked for

Recovered from `brief.objective` (intact; only the title was truncated). The brief nominates a
first mission verbatim:

> **Discover and specify Access & Identity V2. Inventory the existing implementation, identify
> all authority paths and gaps, define the canonical product and security model, produce
> operator flows and implementation-ready specifications, and return a sequenced delivery plan.
> Do not materially implement the product except for disposable investigation tooling.**

with twelve required outputs: existing-state inventory · surface and capability access catalog ·
person ↔ user ↔ role ↔ scope model · authentication model · effective-access resolution model ·
product IA and principal flows · security threat and enforcement matrix · gap analysis ·
decisions requiring approval · sequenced implementation plan · Director acceptance rubric ·
QA and evidence plan.

The brief also specifies **four stages**, a **seven-worker breakdown** (product inventory,
architecture, security, surface inventory, product design, implementation, QA), and a
document-authority rule: *"Workers should not independently reinterpret roles, identity, or
access. The Director owns synthesis."*

## 2. What was compiled, and where it was lost

`brief.plan` contains exactly one phase:

```json
{ "phaseId": "p1", "order": 1,
  "title":     "Access and Roles mission > **Create a complete, understandable, and c…",
  "objective": "Access and Roles mission > **Create a complete, understandable, and c…",
  "requiredOutputs": [], "dependencies": [], "acceptanceCriteriaIds": ["AC1"],
  "approvalGate": "none" }
```

and the sole acceptance criterion is the same string plus a suffix:

```json
{ "id": "AC1", "statement": "…and c… is complete with evidence", "evidenceType": null }
```

Three defects, each with a located cause:

| # | Defect | Cause |
|---|---|---|
| **M1** | Phase objective is a 69-char elision | `inferMissionTitle` truncates at 72 chars (`scripts/local-dev/lib/vacilando/mission-kickoff.mjs:166`), and the **truncated title was written into `plan[0].objective`** rather than the brief's objective. The title is a legitimate display truncation; using it as the objective is not. |
| **M2** | Four stages → one phase; twelve outputs → `requiredOutputs: []` | Brief ingestion did not decompose the narrative brief into the stages/outputs it names. `approvalGate: "none"` also drops the brief's explicit staging gates. |
| **M3** | Acceptance criterion is a tautology with `evidenceType: null` | AC1 is generated as `"<title> is complete with evidence"`. It is unfalsifiable, and with a null evidence type no acceptance checker can evaluate it — so this phase's gate can never fully pass. |

Downstream, `assignment.expectedDeliverables` was empty, so the connector fell back to its
placeholder `"- (document findings in the mission notes)"`
(`scripts/local-dev/lib/vacilando/connectors/claude-connector.mjs:40`). The worker prompt is
therefore correct code doing its best with an empty package — the loss is upstream, at ingestion.

**Not a defect:** running in `wt6` rather than a worker slot. It contradicts the champion rule in
`DIRECTOR-CONDUCTOR-HANDOFF.md` §4.1, but the entire existing A&I corpus was produced here by
`msn_e9133cdade883793d2` (`01-existing-state-inventory.md:7-9`). This is established practice for
this subject area, not a misdispatch. Flagged only so the rule and the practice get reconciled.

## 3. Coverage of the twelve required outputs

Assessed against this directory. "Covered" means an accepted, evidence-cited artifact exists —
not that it is beyond revision.

| # | Required output | State | Evidence |
|---|---|---|---|
| 1 | Existing-state inventory | **Covered** | `01-existing-state-inventory.md` (566 L); accepted `authority-path-inventory.md` (447 L) |
| 2 | Surface & capability access catalog | **Partial** | Route + service-role census exists (`01…:478-527`). No catalog of Settings/operator surfaces, and no census of registered commands vs. server-side enforcement — both named explicitly in the brief. |
| 3 | Person ↔ user ↔ role ↔ scope model | **Covered** | `02-canonical-access-identity-model.md` §2–§9 |
| 4 | **Authentication model** | **Absent** | Zero occurrences of MFA, passwordless, OTP, SSO, SAML, password policy, or session timeout anywhere in the corpus. |
| 5 | Effective-access resolution model | **Covered** | `02…` §9 (Scope), §10 (Where authority is decided) |
| 6 | **Product IA & principal flows** | **Absent** | Excluded by `02…:673` — *"No product UI claim."* |
| 7 | Security threat & enforcement matrix | **Partial** | Enforcement mapped (`01…` §3–§5). Threat model excluded by `02…:674`; RLS policy review excluded by `02…:676`. |
| 8 | Gap analysis | **Covered** | `01…` §4; `02…` §13 divergence register |
| 9 | Decisions requiring approval | **Covered** | `02…` §14 — D1–D4, each with a recommendation |
| 10 | Sequenced implementation plan | **Covered** | `03-implementation-qa-sequence.md`, waves 0–5 |
| 11 | **Director acceptance rubric** | **Absent** | Not present in the corpus |
| 12 | QA & evidence plan | **Covered** | `03…` §10 (QA architecture), §13 (regression locks) |

**7 covered · 2 partial · 3 absent.**

### 3.1 What the remaining mission actually is

The three absent outputs are not filler; two are the operator's most emphasized asks.

- **#4 Authentication model.** The brief lists eleven target capabilities (email/password,
  passwordless link, email OTP, SMS OTP, Google, Microsoft, Apple, enterprise SSO/SAML, MFA policy
  by role/risk, session and trusted-device policy, forced reset/recovery) plus a stated baseline:
  *"Visible/hide-password control on every password field"*, which the brief calls *"a
  straightforward required baseline"*. The corpus has nothing on any of it. This is the single
  largest hole.
- **#6 Product IA & principal flows.** The brief specifies a seven-section **Access & Identity**
  workspace (Overview, Users, Roles, Access Policies, Authentication, Invitations, Audit Log) and
  a seven-state user lifecycle. The corpus deliberately makes no UI claim.
- **#11 Director acceptance rubric.** The brief supplies the raw material — ~20 measurable criteria
  and 7 explicit rejection conditions — but no one has turned them into a rubric the Director can
  gate on. Given M3, this is also what would make future phases of this mission acceptance-checkable.

Output #2's missing half — *"every registered operational command/action and whether access is
enforced server-side"* — is the highest-risk remaining inventory item, because the brief's own
threat statement depends on it: *"A user could be blocked from seeing the Billing workspace while
still calling a billing API."*

## 4. Why this phase stopped

Executing `p1` as compiled requires choosing, unaided, between two mutually exclusive readings:

- **as compiled** — `kind: "implement"`, gate `none` → write Access & Identity V2 code. This
  directly violates the brief's *"Do not materially implement the product."*
- **as briefed** — discovery and specification → but then `p1`'s kind, scope, outputs, and
  acceptance criterion are all wrong, and seven of the twelve outputs are already done, so a
  worker starting from the truncated objective would substantially redo accepted work.

Both readings are defensible from the package as delivered, they lead to opposite work, and the
mission's own governing document forbids workers from resolving this class of ambiguity
themselves (*"Workers should not independently reinterpret roles, identity, or access"*). Escalated
rather than guessed.

## 5. Recommendation

Recompile the mission from the intact `brief.objective` as a **discovery mission scoped to the gap**,
not to the whole brief:

1. **Phase 1 — Authentication model** (output #4), including the password show/hide baseline.
2. **Phase 2 — Command/action enforcement census** (completes output #2).
3. **Phase 3 — Product IA & principal flows** (output #6), against the brief's seven-section workspace.
4. **Phase 4 — Director acceptance rubric** (output #11), derived from the brief's criteria and
   rejection conditions — which also repairs M3 for every later phase.

Outputs 1, 3, 5, 8, 9, 10, 12 are carried forward as accepted inputs, not re-derived. Output #7 is
upgraded from partial only if the operator wants a true threat model (currently an explicit non-goal).

Separately, and independent of this mission: fix **M1** and **M2** at ingestion, so a phase objective
is never a truncated title and a multi-stage brief is not collapsed into one unscoped phase. M1 is a
small, contained fix; M2 is a product change to brief interpretation.

## 6. Limits

- **File-grounded and static.** No live database, no browser QA, no code executed. The coverage
  assessment in §3 is a documentation audit, not a re-verification of the corpus's claims.
- **Coverage is judged against the corpus in this directory only.** Related material may exist in
  `wt1-vac-access-roles` or elsewhere; those paths were outside this session's reachable scope.
- **§3 states presence, not sufficiency.** "Covered" means an accepted artifact addresses the output;
  the Director may still judge a covered output inadequate.
- **M1/M2/M3 causes are located but unfixed.** No Vacilando source was modified by this phase.

## 7. Provenance

- **Mission state** read read-only via `GET /api/missions/brief?mission_id=msn_2d054741a54698fa4c`
  on the running Director (`127.0.0.1:3021`), per the read-only-inspection allowance in
  `DIRECTOR-CONDUCTOR-HANDOFF.md` §7.
- **Cited Vacilando source:** `mission-kickoff.mjs:166`, `connectors/claude-connector.mjs:40`,
  `worker-assignment.mjs:213-225`.
- **Cited corpus:** `01-existing-state-inventory.md`, `02-canonical-access-identity-model.md`,
  `03-implementation-qa-sequence.md`, `authority-path-inventory.md`.
- **No source, schema, migration, or UI changed by this phase.**
