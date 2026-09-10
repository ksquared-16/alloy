---
owner: platform
status: historical
last_reviewed: 2026-09-10
supersedes: []
---

# Decisions required — documentation truth audit, September 2026

These are **not** documentation cleanup. Each is a real architecture, product or ownership
question that documentation alone cannot settle, surfaced because two canonical documents
disagree or because current truth has no owner. They are routed to the Documentation +
Developer Platform master thread.

Evidence-supported documentation decisions made without escalation are recorded in the audit
[`README.md`](./README.md) and in the commits themselves.

---

## D1 — Relocate `docs/platform/planning/`?

242 files of planning and execution material inside the canonical doctrine tree — half of
`docs/platform/` — in direct conflict with governance placement rule 3. It is the source of
nearly every remaining lint violation.

Not moved by this audit: commits land in it daily, it holds five unrelated programs, and code
links into it. A bulk move would disrupt in-flight work and break inbound references.

**Options:** move to `docs/sprints/active/` per doctrine · split by program and move each when
its program closes · formally exempt it and add a lint rule pinning the exception so no
*other* execution tree accumulates in `docs/platform/`.

## D2 — Which document owns the runtime register?

Four canonical documents give three different answers, and none lists Trust Runtime or the
Runtime V1 kernel:

- `foundation/architecture.md` — nine foundational runtimes
- `foundation/platform-manifesto.md` — twelve
- `milestones/freeze-july-2026.md` — twelve
- `platform/runtime/alloy-runtime-kernel.md` — K1 Attention · K2 Provisioning · K3 Focus · K4 Instrumentation

All three of the first set also assert "we do not build additional foundational runtimes", while
two runtimes were ratified and shipped after that freeze. Resolving ownership fixes five stale
statements at once.

## D3 — Are the two runtime corpora complementary, and if so where is that written?

`platform/runtime/runtime-realization-architecture.md` calls itself the Alloy Operating System
Constitution and claims total authority. `platform/operator/alloy-runtime-specification.md`
claims the same ground as the implementation bridge. `docs/README.md` asserts they are
complementary — the Constitution governing runtime, the operator corpus owning product
semantics — but **neither document contains that deferral**, and there are zero cross-references
between the corpora. The Constitution mentions "Record of Attention", "Context Frame", "Focus
Panel" and "Perspective" zero times each.

Either write the deferral into the Constitution, or reconcile the corpora. A README-level
assertion is not an authority rule.

## D4 — Which document owns the card primitive?

Two parallel taxonomies both carry `status: canonical`: the numbered System 4 → 5 → 5A → 5B → 5C
chain, and the Grammar → Language → Composition stack. Anatomy is defined in three documents,
Colour Language in two under the same heading.

Code adjudicates the density ladder: `focusPanelCardGrid.ts` has **four** steps. `universal-card-system.md`
says four, `card-language.md` five, `operational-grammar.md` six. Recommend `universal-card-system.md`
as owner — it is the only one matching code — but that retires a taxonomy and needs a decision.

## D5 — Work Items has no canonical owner

Work Items and Work Unit are genuinely different things (no `work_item*` table exists; Work
Items is a presentation layer over `operational_tasks` plus two virtual projections). The concept
split is correct, but no `work-items*.md` exists anywhere, and the two documents describing it
disagree: `operator/operational-workspace-shell.md` says the primary axis is a process rail;
`operator/queue-system.md` says Folders · Views · Sources. Code says the latter.

## D6 — Scheduling / staffing has no canonical owner

Employment foundation, staff assignment eligibility, staff presence facts, operational
assignment and roster all shipped between July and September 2026, ungated and certified. No
canonical module document owns them. Separately, `core/operational-ux-doctrine.md` and
`core/operational-truth-flow-doctrine.md` both describe staffing in terms of **shifts** — no
shift model exists; staff supply is `schedule_assignments` with `subject_type='staff'`.

## D7 — Did subsidy deliberately override a frozen law?

`modules/financial-platform-domain.md` freezes determination #5, "Third-Party Payer generalizes
subsidy", and requires a first-class Third-Party Payer entity. Shipped subsidy is
childcare-specific (`financial_funding_agencies`, `financial_subsidy_programs`,
`financial_subsidy_claims`). `modules/billing-financials-platform.md` consciously overrides the
frozen law — "not a platform party redesign subsidy does not justify" — with no `supersedes`
link between them. Either the freeze is amended or the implementation is a recorded exception.

## D8 — Two forked copies of the access-identity corpus

The same eight documents exist under `docs/platform/planning/access-identity-v2/` and
`docs/platform/planning/vacilando-os/qa/access-identity-v2/`, with code citing the two copies
inconsistently. The repository already records this as an open Director decision (`OD-4` / `X-2`).
Compounding it, `w45-w51-truthful-access-execution.json` is the only place in `docs/` recording
the approved canonical access model and defining `OD-8`.

## D9 — Promote the normative half of `docs/runtime/`?

About ten of its 52 files are normative with no equivalent under `docs/platform/`, and **20
`web/` source and test sites cite them**, including a live route. Promotion must rewrite those
`@see` paths in the same commit. Two `OPEN-DECISION-*.md` files must be routed somewhere live
first — archiving an open question is how it gets lost. The three repository-root execution
artifacts belong to this corpus.

## D10 — Is the Operational Expectations activation seam an approved rollout control?

`ACTIVATED_AUTHORING_PURPOSES` lets a named purpose author production ledger rows without the
`oe.ledger.author` flag. This audit corrected the documents that denied it, but the seam itself
is described **nowhere** in `docs/`, and it changes what three canonical and milestone documents
assert about the ledger's safety posture. It needs an owning document and, if it is a durable
architectural control, a Platform Decisions entry. The flag module's own docblock still says
"OFF (default) → no Operational Expectation authoring", two functions above the code that
contradicts it.

## D11 — Should docs-lint enforce placement rule 3?

Governance's most consequential placement rule — no sprint artifacts inside `docs/platform/` —
has no implementation. A `status: sprint` document there passes silently; there are 54 of them.
Adding the rule is easy; deciding what it does about D1's 242-file exception is not.
