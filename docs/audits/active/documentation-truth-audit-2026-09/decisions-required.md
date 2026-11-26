---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# Decisions — documentation truth audit, September 2026

The audit opened eleven items. A continuation pass triaged each against implementation and
governance. **Five were resolved**, one dissolved as a mis-comparison, and **five remain genuine
decisions** that documentation cannot settle.

Triage classes: **A** — implementation and doctrine already determine the answer. **B** — a
documentation lifecycle/ownership question that governance answers. **C** — different plausible
documentation outcomes imply different platform behaviour, so it is not documentation's call.

---

## Resolved

### D1 — Relocate `docs/platform/planning/`? · **B · resolved: do not relocate**

Investigated on evidence rather than aesthetics. The tree is load-bearing infrastructure:
`scripts/local-dev/lib/vacilando/acceptance.mjs` keys a live acceptance gate on the literal
prefix; `web/tests/enrollment/assignmentCommitmentAuthority.test.ts` reads a document from it at
runtime; two `web/package.json` scripts write evidence JSON into it. A move breaks ~46 hardcoded
code paths and 186 depth-sensitive links.

More decisively: ~38 of the 242 files are genuine doctrine, and governance forbids doctrine living
in `docs/sprints/`. And because `GOVERNED_GLOBS` does not cover `docs/sprints/**`, relocating
would have *hidden* ~363 violations rather than fixed them. Meanwhile the confusion risk is
already near zero at the routing layer — `docs/README.md`, `.cursor/rules/` and `CLAUDE.md`
contain no references into the tree.

Resolved by making the exception explicit in `scripts/docs-lint.mjs` and
`governance/documentation-governance.md`, with three new rules that keep it visible.

### D3 — Are the two runtime corpora complementary, and where is that written? · **A · resolved**

The deferral was real but lived only in `docs/README.md` — an authority rule in a navigation file.
It is now written into the Constitution itself (Article 7.6, where it already defers to Product),
naming `canonical-interaction-model.md` as the owner of Record of Truth / Record of Attention /
Context Frame, with a reciprocal pointer back from `alloy-runtime-specification.md`.

### D4 — Which document owns the card primitive? · **A · dissolved**

Not a collision. One chain at seven altitudes in which every document that could claim the
primitive explicitly disclaims it. The real defect was two documents putting *behaviour* values on
the *sizing* axis: `operational-grammar.md` listed six densities and `card-language.md` five,
against a runtime enum of four. "Focused" is a perspective; "Immersive" is System 5B's Embedded
Workspace — and `immersive` appears nowhere in `web/`. Corrected to point at the owner. Colour
Language, genuinely defined twice with conflicting meanings, is de-duplicated to System 5, which
is what `globals.css` implements.

### D5 — Work Items has no canonical owner · **A · resolved**

It did have one. `queue-system.md` §Work Items queue was already accurate (Folders · Views ·
Sources) and is now named as the owner. `operational-workspace-shell.md`'s stale process-rail
description is corrected. There is no `work_item*` table — Work Items is a presentation layer over
`operational_tasks` plus two virtual projections, so the concept split from Work Unit is correct.

### D11 — Should docs-lint enforce placement rule 3? · **B · resolved: yes**

Implemented as `sprint-artifact-in-platform`, scoped to everything outside the D1 exception. Seven
existing violations, report-only. Governance's most consequential placement rule had never been
implemented.

---

## Genuine decisions remaining

### D2 — May an August canonical document supersede a frozen July milestone?

**Class C.** Most of the reported "runtime register conflict" was mis-comparison and is now
reconciled: the two "nines" are different lists (nine *runtimes* in `architecture.md`, nine
*layers* in `os-runtime-map.md`); twelve is the nine plus three contained sub-runtimes, which the
freeze doc already annotates as contained; the K1–K4 kernel is explicitly "not a new foundational
runtime"; and Trust is a foundational *platform*, a separate register.

What does not dissolve: `alloy-runtime-kernel.md` (canonical, 2026-08-14) issues **dispositions**
on five of the twelve runtimes still listed as canonical owners by `freeze-july-2026.md` and
`platform-manifesto.md`, both `status: frozen` — "Navigation Runtime — **DELETE**, the concept
dissolves"; Queue "it is not a runtime; it never was"; VM "as an independent runtime it is
deleted"; Current Work "**MOVE** → Business Processes"; Focus Panel "it is **not** a separate
runtime".

**Code says the kernel won.** `SurfaceHostContext.tsx` records the realized cutover
("BEFORE: pathname → … / NOW: K1 → K2 → K3 committed Focus"), and `AdminV2WorkspaceClientProviders.tsx`
mounts the Surface Host inside the kernel provider. The architecture is settled in implementation.
What is unsettled is which document may say so.

| Option | Consequence |
|---|---|
| **(a) Kernel supersedes** — foundation docs stop naming runtimes and point to the kernel | One register; but amends two `status: frozen` milestones, which a freeze does not obviously permit |
| **(b) Freeze is historical** — milestone docs get a superseded-by banner, text unchanged; five foundation docs stop asserting the list in present tense | Preserves the frozen record intact; five edits; reader follows a pointer |
| **(c) Both stand, explicitly labelled** | Nothing retracted, but the corpus permanently holds "Navigation Runtime owns URL projection" and "Navigation Runtime — DELETE" as concurrent canon |

**Recommendation: (b).** A freeze is a record of a moment; it should not be edited, and it should
not be read in the present tense two months and a shipped kernel later.


**Thread 2 packet — the code is not ambiguous; the governance rule is.**

*Abstraction levels.* The three documents are not speaking at the same level, and that is most of
the apparent conflict. `freeze-july-2026.md` **records a moment** — it is a declaration that
construction stopped, not a live subsystem inventory. `platform-manifesto.md` **states intent**.
`alloy-runtime-kernel.md` **inventories subsystems and dispositions them**. A milestone that records
a moment cannot be "wrong" later; it can only be read wrongly, in the present tense.

*Code sides with the kernel, unambiguously.* `AdminV2WorkspaceClientProviders.tsx` mounts
`SurfaceHostProvider` **inside** `RuntimeKernelProvider` — exactly the kernel's "Surface Host KEEP →
becomes K3 Focus" disposition, with the Host surviving as a renderer driven by K3.
`SurfaceHostContext.tsx` records the realized cutover in its own comment. The architecture is
settled in implementation; only the documentation authority is not.

*So the question is narrower than it looked.* It is not "which runtime register is true" — it is
**"may a later canonical document restate a frozen milestone in the present tense, and if not, who
carries the correction?"**

**Recommendation stands: (b), treat the freeze as historical.** A freeze is a record of a moment. It
should not be edited — that destroys the record — and it should not be read as present tense two
months and a shipped kernel later. The correction belongs in the *reading*, not the *record*:
banner the milestone documents as historical, and stop the foundation documents asserting the July
list in the present tense.

**The general rule worth adopting**, because this will recur: *a `frozen` document is evidence of a
decision at a date and is never silently superseded; a later `canonical` document may state current
truth that departs from it, and must say so at the point of departure. The frozen document is
bannered, not edited.* Thread 2 applied exactly this pattern to the subsidy freeze (D7) without
amending the law, which is the same shape.

### D6 — Who owns Scheduling / staffing documentation? · **RESOLVED (Thread 2)**

**Thread 1 overstated this.** Two canonical owners existed and were missed:
`rfcs/operational-expansion-phase1.md` (canonical, frozen) states outright that it *"Governs
Scheduling, Attendance, Capacity, Staffing, Billing, Forecasting, Recommendations, and Actions"*,
and `modules/attendance-system.md` already owns the staff branch of the operational day in
detail — presence facts, staff supply, roster composition, and the workspace split. It is simply
named for Attendance, so a reader looking for "staffing" never finds it.

Exactly one thing genuinely lacks an owner: the `schedule_assignments` /
`operational_assignment_types` **commitment object** as a subject-neutral domain — its lifecycle
states, `commitment_kind`, supersede-not-patch rule and type registry. `placement-system.md` owns
its child branch; `attendance-system.md` owns everything downstream; neither owns the object.

**Resolved with four bounded edits, not a new module doc.** A Scheduling module doc would have to
define a domain model for a capability with **zero staff assignment rows**, a **child-only write
path**, **no shift model in any of the 398 migrations**, and **all four scheduling capability keys
inert**. That is doctrine ahead of product. The commitment object gets a canonical owner on a
legible trigger: when `subject_type='staff'` traffic exists and the write path has a staff branch.

### D7 — Does the frozen Third-Party Payer law stand?

**Class C.** `financial-platform-domain.md` freezes "Third-Party Payer generalizes subsidy" and
requires that entity first-class. Subsidy shipped childcare-specific
(`financial_funding_agencies`, `financial_subsidy_*`), and `billing-financials-platform.md` gives a
reasoned override — an agency needs "the narrowest thing that works", and "not a platform party
redesign subsidy does not justify". Both positions are coherent; there is no `supersedes` link.

Options: amend the freeze to match what shipped · keep the freeze and treat the implementation as
a recorded exception to be generalized later · re-generalize subsidy onto a Third-Party Payer
entity. This pass added a warning to the frozen doc so nobody builds on determination 5 as though
the generalization exists in the schema. **No recommendation** — this is a financial domain model
question, and the cost of the third option is not visible from documentation.


**Thread 2 packet — the cost is now visible.** Thread 1 gave no recommendation because "the cost
of the third option is not visible from documentation". It is four divergences, not one, of very
different cost:

| # | Law requires | Shipped | Cost to close |
|---|---|---|---|
| 1 | A payer-agnostic **Third-Party Payer** reference entity | `financial_funding_agencies` — **already payer-agnostic**; nothing in it names childcare, and its program vocabulary already spans government / employer / scholarship / corporate | **Naming only.** A rename plus a `payer_kind` column |
| 2 | **Coverage** attached to an Agreement | `financial_subsidy_authorizations` is hard-bound to a child (`customer_id` and `customer_member_id` both NOT NULL) — it cannot express employer coverage of a household or a grant covering a cohort | **Moderate**, and cheap only while there is one payer kind |
| 3 | Responsibility takes a `Party (household \| employer \| Third-Party Payer)` | `responsible_party_type check (in ('person'))` — a Third-Party Payer can **never** be a responsible party | **Expensive, and it is a doctrine change** |
| 4 | A **Settlement Run** spanning payers | Per-payer remittances + variances | **Low** — an additive parent table |

**Recommendation: split it.** Amend the freeze for #1 and #2 — the shipped payer entity satisfies
the law's purpose (keep the schema payer-agnostic) even though it fails its vocabulary, and #2
should be fixed while it is still cheap. Do **not** fold #3 into this decision: whether a
non-person party can owe money in Alloy is its own question, and the Director's existing
explicit-named-party decision was reasoned about people. Re-generalizing subsidy now would spend
migration and re-certification budget on zero behavioural change, in a module that **has no
operator surface at all** — optimizing the wrong end.

### D8 — Reconcile the diverged Access/Identity copies · **RESOLVED (Thread 2)**

**Ownership is provable from code and did not need escalation.** Set A
(`planning/access-identity-v2/`) owns the **plan**; Set B (`vacilando-os/qa/access-identity-v2/`)
owns the **evidence**. That is what both READMEs already say; what was missing was proof.

The proof is citation resolution, not recency:

- Every section a Set-B citation names (§5, §7) **exists identically in both copies** — not one
  Set-B citation resolves uniquely to B.
- Roughly two dozen Set-A citations name sections (§18, §21, §45–§48) that **do not exist in B at
  all**.

So repointing Set-B citations at Set A would lose nothing; repointing Set-A citations at Set B
would break two dozen. Set B is nonetheless **immovable**: a test reads
`w11-catalog-reconciliation.json` from it at runtime, and the acceptance gate's
`ALLOWED_CHANGE_PREFIX` is that folder.

**Correction to the Thread 1 record.** This register previously said "about 30 code sites cite the
stale copy against 11 citing the current one". The counts were right; **the labels were inverted in
effect.** Set A is "stale" only along the execution-log axis. Along the plan-structure axis Set B
is missing most of the plan, and it is the citations into A's later sections that are load-bearing.
A reader acting on the earlier sentence would have repointed code the wrong way.

**Disposition:** ratify the existing split; repoint the handful of `B/03` citations at `A/03`
(they name sections identical in both, so it is mechanical and lossless); banner `B/03` as the
execution ledger rather than a plan. Do **not** merge the two files — the execution log is
evidence, and editing it into a plan destroys the provenance `PRODUCT-SOURCE.md` exists to protect.
Whether Set A also receives copies of `00`/`04`/`05`/`06`/`07` is a separate, smaller decision.

**Coordination note:** a live `agent/access-identity` branch is changing catalog and ratchet
figures in this area daily. Thread 2 therefore documented access **method and source file** rather
than frozen counts, so the governance doc survives that merge.

### D9 — Promote the normative subset of `docs/runtime/`?

**Class B (blocked on cost, not on judgment).** About ten of its 52 files state durable runtime
authority with no equivalent under `docs/platform/`, and **20 `web/` source and test sites cite
them**, including a live route. Governance now says this plainly rather than calling the whole
directory execution history.

Promotion must rewrite those 20 citations in the same commit or the doc-to-code binding breaks
silently, and the two `OPEN-DECISION-*.md` files must be routed somewhere live first — archiving
an open question is how it gets lost. That is a bounded refactor someone should schedule, not an
unattended documentation edit.

### D10 — Is the Operational Expectations activation seam a ratified rollout control?

**Class C.** `ACTIVATED_AUTHORING_PURPOSES` lets a named purpose author production ledger rows
without the `oe.ledger.author` flag. Every document that denied this is corrected, and the
engineering-realization milestone is marked superseded in part. But the seam itself is described
nowhere in `docs/` as a design, and it changes what the frozen OE corpus asserts about the
ledger's safety posture.

It needs an owning document and, if it is a durable architectural control, a Platform Decisions
entry. Note the flag module's own docblock still says "OFF (default) → no Operational Expectation
authoring", two functions above the code that contradicts it — application source, left alone by
this documentation pass.

**Thread 2 packet.**

*Has the line been crossed?* Both readings are honest. **Yes:** the P1 certification says flatly
there is no operator-facing authoring surface and the intake is flag-gated off; both are now false
for one purpose. **No:** every such sentence is scoped, in the frozen source's own bolded word, to
the *generic* intake — which the seam does not touch. The seam changed no semantic law: rows land
`proposed` and stay there, because Attendance authors under an individual and holds no governed
authority. What it changed was *procedural*: the corpus assumed the first production write would be
gated by an operator setting an env var, and the seam made it gated by a merge instead. Both are
legitimate rollout controls; they differ in who holds the lever and how visible pulling it is.

*What ratification would change.* **Code: nothing** — it runs today. **Docs: substantial** — the
seam has no owning document. **The gate for adding a second purpose: everything.** There is no CI
check, no lint, and no CODEOWNERS entry constraining the activated-purpose set. The nearest thing
to a gate is a test asserting the set has exactly one member — load-bearing by accident, and a
purpose-adding PR would simply update it.

*One live consequence nobody has decided.* The ratification gateway passes **no purpose**, so an
activated purpose can author `proposed` rows in production that **nothing in production can
ratify** while the env flag is off. That is either a deliberate safety posture or an oversight;
right now it is undocumented either way.

**Recommendation: ratify, with three conditions** — give the seam an owning document and a Platform
Decisions entry; name the gate for adding a purpose (at minimum CODEOWNERS, better a test that
enumerates the set by name so a new purpose fails CI naming a reviewer); and decide the
ratification asymmetry explicitly.

**Do not remove the seam.** That is the option with the largest blast radius despite sounding
conservative: absence, vacation and closure authoring stops, its certification loses its input, the
kiosk's closed-day guard loses its source, and tenants land where old closures apply and no new one
can be authored. Restoring it would require either the global flag — opening every domain — or the
privilege escalation the seam exists to avoid.
