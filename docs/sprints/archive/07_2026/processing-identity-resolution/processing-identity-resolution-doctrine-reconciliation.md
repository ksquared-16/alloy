# Processing Identity Resolution — Doctrine Reconciliation

**Baseline:** `origin/staging` @ `65afc8527`. This table lists documentation that must change **if this architecture is approved**. Per repo governance (`documentation-governance.md`): freeze before documenting — this sprint lives under `docs/sprints/archive/07_2026/`; canonical `docs/platform/` edits happen only at closeout, when decisions are frozen. **No doctrine is edited now.**

| Document | Current statement | Runtime evidence | Required change | Architecture phase |
|---|---|---|---|---|
| `docs/platform/modules/documents-and-forms.md` (Digital Mailroom) | "Processing remains the engine underneath; not the operator-facing architecture" | Processing engine exists; identity resolution is the missing engine capability **[C]** | Add Identity Resolution as an engine capability surfaced through Digital Mailroom; keep V1 UI frozen | D3 |
| `docs/product/documents-and-forms.md` (trust boundary) | "Public values are proposals until intake/DCP promotes them; Phase 1 does not auto-write CRM fields" | Honored for packets; **violated** by `applyFormIntakeSafe` lead-capture (writes persons/opportunities pre-case) **[C]** | State that lead-capture identity now flows through the resolution engine's plan→approve→commit; reconcile the auto-op-vs-review tension | C1, D5 |
| `docs/product/documents-and-forms.md` / `platform/modules/documents-and-forms.md` (DCP) | "DCP / per-field CRM apply — In Progress / next sprint" | DCP is the "proposed changes → approve → commit" tail; unbuilt **[C]** | Fold DCP into the Recommendation/Update op + Commit Plan; flip capability status on delivery | D1, E |
| `docs/forms/linkage-review-operator-flow.md` | "Alloy does not create new persons/customers/child members/opportunities from the linkage panel in this release" | true today **[C]** | Update: create-new/link/merge now happen via the resolution plan; describe the new operator contract (§7.12) | D3 |
| `docs/forms/existing-record-public-link-contract.md` | FK seeding "manual via PATCH/scripts"; prefill "not implemented" | `form_context_mode`/`source_entity_*` stamped server-side **[C]** | Elevate to the canonical adapter `trust_context.launch_context`; document server-stamped trust | B3, C1 |
| `docs/platform/modules/business-process-execution-platform.md` / `operational-mutation-platform.md` | "All operator mutations execute through the runtime"; runtime is status-only | ~30 raw `opportunities.update` sites; **no** record-creation/link/merge command; 3 competing status writers **[C]** | Add canonical record-creation/link commands to the registry; state Processing commit invokes commands (no raw writes); note the executor as a runtime consumer | D0, D2 |
| `docs/platform/core/status-and-state-system.md` | Four status domains; `person_status`/`account_status` registered | `person_status`/`account_status` declared with **no handler** **[C]** | Register `person_status` handler (used by identity commits); clarify Processing case status vs entity status | B2, D1 |
| `docs/platform/core/entity-model.md` / `record-system.md` | `persons` canonical; `contacts` legacy; person-first | `persons` has **no uniqueness/no org FK**; `contacts` has global uniques **[C]** | Add `persons.org_id` FK + normalized-key **non-unique** indexes (Decision C: email/phone are signals, **not** unique keys); add `customer_members` natural-key unique; retire global `contacts` uniques; state Parent/Guardian = roles not entities (Decision A) | B0, D0 |
| `docs/audits/person-vs-contact-audit.md` (follow-up #1) | "Enumerate every route that inserts contacts without person threading" | gutters + backend leads still write contacts **[C]** | Close the follow-up as sources cut over; mark inbound parity done | E4 |
| `docs/platform/foundation/platform-event-catalog.md` | `intake_case_*` events catalogued | not all emitted; new commit/resolution events needed **[C]** | Add resolution/commit/exception event keys; reconcile which `intake_case_*` are emitted | B3, D2 |
| `docs/platform/foundation/product-roadmap.md` / `platform-capabilities.md` | "Record identity resolution — next separate sprint"; DCP In Progress | this sprint delivers it **[C]** | On closeout: move to Complete; summarize in `release-history.md` | closeout |
| `docs/platform/governance/glossary.md` / `docs/platform/governance/glossary.md` | Person/Customer/Contact/Opportunity defined; **Intake/Processing/Processing Case/Identity Resolution/DCP not defined** | terms used in sprint docs + code, absent from canonical glossary **[C]** | Add canonical glossary entries: Intake, Processing, Processing Case, Intake Envelope, Identity Subject, Candidate Match, Resolution, Commit Plan, Identity Resolution, DCP, Merge | closeout |
| `docs/platform/modules/communications-identity-platform.md` | comms identity = sender/channel resolution | separate domain; naming-collision risk with record identity **[C]** | Add a disambiguation note: comms identity ≠ record identity resolution | B (README already states) |
| `docs/schema/schema-policies-and-security.md` | documents `admin_ops_full_access` | policy is **non-org-scoped** on customers/opportunities/contacts/OCM **[C]** | Document the org-scoped replacement (B0) | B0 |
| `docs/sprints/archive/07_2026/processing-form-workflow-finish-closeout.md` | "identity resolution … remains the next separate sprint" | this is that sprint | Cross-link to this sprint folder | now (link only) |

## Consistency with established Alloy principles

The proposed architecture is checked against Alloy doctrine and is consistent:

| Principle | How the architecture honors it |
|---|---|
| **Deterministic-first** | Signals/bands are rule-based; AI is propose-only; no score is authoritative alone |
| **Human authority** | Ambiguous identity + material change require operator approval; merge is privileged; automation is Phase-G-only and measured |
| **Explainable intelligence** | Every candidate/signal/recommendation/commit carries what/why/support/contradiction/rule-or-model/what-changes |
| **Canonical entities** | Resolves to `persons`/`customers`/`customer_members`/`opportunities`; no new identity entity |
| **Canonical record authority** | Commit invokes registered commands + mutation runtime; never raw writes |
| **Business-process ownership** | Enrollment participation stays with `process_instances`/OCM (decision 4); Processing hands off |
| **Workflow & action ownership** | Side effects via `emitEvent`/`executeAdminAction`; Processing does not reimplement them |
| **Event-driven downstream** | Commit emits canonical outbox events; projections subscribe (existing contract) |
| **Organization isolation** | Org-scoped generation + commit; RLS; security prerequisites (B0) |
| **No hidden mutation** | Immutable plan + approval binding + audit trail; no silent merges |
| **No unnecessary source-specific architecture** | One resolver, one normalizer, one commit path; sources are thin adapters |

## Governance note

At closeout: summarize into `docs/platform/foundation/release-history.md` and flip the Documents & forms capability (`platform-capabilities.md`, DCP → shipped); if a new canonical doctrine emerges (e.g. a Processing/Identity-Resolution platform doc), create it under `docs/platform/` and register it in `docs/README.md` load order. Update this sprint's `README.md` status table as artifacts move from design to delivered.
