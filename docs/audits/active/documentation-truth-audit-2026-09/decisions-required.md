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

### D6 — Who owns Scheduling / staffing documentation?

**Class C.** Employment foundation, staff assignment eligibility and staff presence facts shipped
August 2026 and `web/app/adminV2/scheduling/` exists, but no canonical module doc owns the domain.
Writing one means defining the domain model — product work, not documentation maintenance,
particularly since two core doctrine docs described staffing in terms of a **shift model that does
not exist** (corrected in this pass to `schedule_assignments` with `subject_type='staff'`).

Recorded as an owner gap in `product-roadmap.md` and the audit README. Someone must decide whether
Scheduling gets a module doc now or after the domain settles.

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

### D8 — Reconcile the diverged Access/Identity copies

**Class C (bounded).** Not the "two forked copies" the audit first reported: both directories
declare their relationship — `planning/access-identity-v2/` is the product-source copy,
`vacilando-os/qa/access-identity-v2/` is runtime certification evidence, and each names the other.
Ownership was never ambiguous.

The defect is divergence, and it is **bidirectional**: `01` and `02` are richer in the
product-source copy, while `03-implementation-qa-sequence.md` — the document the copy calls "the
plan of record" — is newer in the evidence copy (2026-09-06 vs 2026-08-10, eight execution
updates). Code citations split roughly 40/44, and for `03` specifically about 30 code sites cite
the stale copy against 11 citing the current one.

Recorded in the copy's README so nobody reads a month-stale plan as current. Merging 5,000-line
documents is content work for the owning team, not a documentation-maintenance act. Note a live
session is working this area.

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
