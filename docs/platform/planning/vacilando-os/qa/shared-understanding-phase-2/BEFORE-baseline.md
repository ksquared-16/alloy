# Phase 2A — Evidence baseline (Shared Understanding visibility)

Durable sources traced: Product Definition (`accepted_decisions`{statement,rationale,provenance,supersedes}, `constraints`{hard}, `rejected_patterns`{revisit_if}, `patterns`, `goals`, `known_tradeoffs`, `operator_notes`), Capability (`known_issues`, `current_implementation`, `roadmap`, `maturity`), Package (`gap_report.findings`, `suggested_acceptance_criteria`, `risks`, `readiness_verdict`), Mission store (real attempts). All durable (JSONL, survive restart/provider/session).

| Conversation | Durable understanding available | Visible today | Missing / misleading |
|---|---|---|---|
| **Access & Roles** | 2 operator decisions (+rationale), 2 hard constraints, 2 rejected patterns (revisit_if), 1 tradeoff, 3 goals, open issue ki1 (audit), 8 real prior attempts, 4 Director-suggested criteria | Phase-1 counsel line (attempt+readiness) in transcript; right col shows raw "knows" (capability/2 decisions/8 missions/refs/package) + needs | Decisions, constraints, rejected directions, the accepted tradeoff, the open audit gap — none legible as a *reliance surface*; operator must open the package. Rejected patterns invisible. |
| **Communications** | 1 operator decision ("logged+consented before send"), frontier u_maturity (V1/V2) | Phase-1 closing surfaces u_maturity once; needs shows it | The decision + the *unresolved V1/V2 frontier* not shown as durable state; only in the conversational line |
| **Scheduling** | 1 operator decision, confidence 0.2 (thin) | Phase-1 weak line; needs empty | Thinness only in conversational wording, not as a reliance state |
| **Financials** | 1 operator decision (money-touching), conf 0.4 | Phase-1 weak+ledger line | Ledger risk/accepted uncertainty not explicit in durable surface |
| **Reporting/Onboarding** | 1 operator decision each, conf 0.4 | Phase-1 weak line | Same — relied-upon claim + thinness not legible |
| **Retention** | 0 decisions (empty PD), verdict Needs Product Decisions | Phase-1 honest send-back | The *unresolved missing-decisions* state not shown as durable frontier; correct that nothing is fabricated |

## Findings
- **Durable state is rich but invisible as a reliance surface.** The operator can only reconstruct "what we rely on / what's open / why" by opening the package, gap report, PD, and mission list.
- **Right column ("Director's read")** shows raw `knows`/`needs` lists — closest existing surface, but it's a flat fact dump, not typed by epistemic status × authorship, and it hides decisions-vs-recommendations, superseded, and carried uncertainty.
- **Root cause:** no projection exists that reads the durable facts and expresses the *curated reliance surface* (Intent + typed claims + frontier + provenance). Phase 1 made counsel legible; the underlying state it relies on is still buried.
- **Smallest seam:** a pure `shared-understanding.mjs` projection over the SAME durable facts + reuse of Phase-1 `selectFrontier`/`attemptCounsel` (one source of truth), rendered in the existing right column. No new store, no editor, no page.
