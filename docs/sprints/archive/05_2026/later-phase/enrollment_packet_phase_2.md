# Enrollment Packet — Phase 2 Enhancement Plan

**Date:** May 2026  
**Depends on:** **Enrollment Packet E2E Phase 1** (shipped — see **`docs/product/documents-and-forms.md`**, **`docs/product/crm-system.md`**, **`docs/sprints/archive/05_2026/enrollment_journey_packet_operations_v1.md`**, **`docs/product/communications.md`**).

**Execution trail (thin slice):**

| Step | Doc |
|------|-----|
| 0 — Audit | [`forms_documents_phase_2_step0_audit.md`](./forms_documents_phase_2_step0_audit.md) |
| 1 — Design | [`forms_documents_phase_2_step1_design.md`](./forms_documents_phase_2_step1_design.md) |
| 2 — Sprint + cards | [`forms_documents_phase_2_packet_review_mvp.md`](./forms_documents_phase_2_packet_review_mvp.md) |
| 3+ — Build | Execute P2-1 … P2-5 from sprint doc |

This document is **forward-looking only** for sections A–G. The **approved near-term slice** is design-bound in Step 1 (review rollup, non-PDF surfacing, provenance labels, read-only BOS, optional correction draft, thin branding). Unless a capability is explicitly called out as partially present today, treat items below as **not implemented**.

---

## Phase 1 shipped state (reference)

End-to-end loop **complete** for:

- Opportunity drawer **packet launch** (definition, recipient, **multi-child / household** launch metadata — config-driven).
- **Communications**-backed email with templated subject/body and **packet link injection** (`queued` → worker → provider; webhooks for delivery — **`docs/product/communications.md`**).
- **Public packet** completion on the forms embed.
- **`workflow_events` / Activity** projections for packet lifecycle + **compact Overview** review indicator; operator **approve / reject / needs correction** on **`form_packet_sessions`**.
- **Approval** triggers **idempotent** **`createGeneratedPdfForSubmission`** for each **submitted** step that has usable **`pdf_mapping_json`** (same code path as admin “Generate document”).
- Opportunity **Documents** tab merges direct opportunity **`documents`** with **`documents`** reachable via **`form_submission_documents`** for packet session submissions; optional inline links to submission / packet session admin URLs when enriched.
- **No** automatic canonical CRM mutation from raw public packet answers **beyond existing intake / linkage rules**; **`form_submissions.payload`** remains the capture truth.

**Doctrine (carry forward):**

| Layer | Role |
|-------|------|
| **Forms Engine** | Canonical intake + **`form_submissions`**. |
| **`form_packet_sessions` / items** | Packet execution truth. |
| **`workflow_events` on opportunities** | CRM **visibility** / Activity — not duplicate execution truth. |
| **Communications** | Delivery layer for outbound packet email. |
| **`documents` + `form_submission_documents`** | Artifacts linked through submissions — **not** “files stored on opportunity” as a hack. |

---

## Non-goals / anti-patterns

- **No parallel enrollment subsystem** — no second schema or product silo “next to” Forms + CRM.
- **No** treating **`workflow_events`** as authoritative for packet step state — session/items/submissions remain source of truth.
- **No** claiming **Phase 2** UX (field-level proposals, AI matchers, SMS packet delivery, etc.) is shipped until implemented and documented in **as-built** product docs.
- **No** auto-promotion of **untrusted** public field values onto canonical **`persons` / `customers` / `customer_members`** without an explicit, auditable operator or proposal workflow.

---

## A. Data Change Proposals (DCP) / submitted data review

**Goal:** Public and stakeholder-submitted values become **proposed changes** with explicit compare/approve/reject semantics — **generic** CRM model (not childcare-only).

**Planned capabilities**

- **Proposal records** (or equivalent) keyed by `(org, source_submission_or_step, target_entity, field_path)` with status: `pending` | `approved` | `rejected` | `ignored` | `needs_correction`.
- **Diff UI:** submitted text vs trusted CRM snapshot / resolved entity fields.
- **Granularity:** per-field decisions; optional batch “approve all non-conflicting.”
- **AI (later):** suggest likely matches, duplicate detection, and recommended actions — **human-in-the-loop** until policy changes.

**Acceptance (Phase 2 exit for this slice)**

- Operator can open a packet review and see **field-level** proposals with clear **before / after** and decision controls.
- Approving a proposal writes through a **single** auditable application path (no silent PATCH from public routes).

**Open questions**

- Normalized **field_path** vocabulary vs free-form JSON pointers for `payload.values`.
- Whether DCP rows **merge** into existing linkage-review APIs or replace a subset.

---

## B. Review hardening

**Goal:** Operator review matches the risk of enrollment decisions.

**Planned capabilities**

- Richer **packet review** surface (still CRM-native — drawer / modal / dedicated admin page TBD).
- **Field-level diffs** across steps + `shared_values` (where used).
- **Mismatch warnings** beyond today’s heuristics (configurable rules? per-org thresholds?).
- **Packet-level vs field-level** outcomes (e.g. approve packet but flag specific fields for correction).
- **Correction request** loop with parent-visible messaging and re-open semantics.

**Acceptance**

- Reviewer can complete common cases **without** raw JSON editing.
- Correction loop produces **observable** Activity + Communications events (when messaging is in scope).

**Open questions**

- UX home: **drawer-only** vs **packet session detail** as primary review console.

---

## C. Documents / forms hardening

**Goal:** Artifacts are trustworthy and understandable across the lifecycle.

**Planned capabilities**

- **Non-PDF forms:** surface “submitted step” in Documents or adjacent surface when **no** `pdf_mapping_json` (placeholders, deep links, or lightweight generated summaries — **design choice**).
- **Document lifecycle:** `draft` / `superseded` / `void` semantics where product requires; visible status in drawer lists.
- **Versioning / audit:** trace which **published version** produced an artifact; regeneration policy.
- **Attachments / signatures:** drawn assets, multi-attachment steps, bundle/zip export (policy-driven).

**Acceptance**

- Operator can answer “which submission produced this file?” and “is it still current?” without SQL.

**Open questions**

- Whether **bundle PDFs** across steps belong in Phase 2 or a later “compliance packaging” phase.

---

## D. Messaging / delivery hardening

**Goal:** Enrollment comms are as reliable and configurable as the rest of Communications.

**Planned capabilities**

- **Configurable templates** stored with **packet definition / org** metadata (not only ad hoc composer text).
- **Reminders / resend** — scheduled follow-ups for `in_progress` / `needs_correction` sessions.
- **SMS** delivery option for packet links where org bindings allow.
- **Delivery tracking** — richer dashboards on queued vs sent vs delivered/bounced; webhook **health** checks.
- **Deliverability checklist** per tenant (SPF/DKIM, from-domain alignment, suppression lists) — docs + optional UI guardrails.

**Acceptance**

- Template changes are **versioned** and do not break in-flight sessions unexpectedly.
- Reminder sends appear in the same **canonical** `communication_messages` stream.

**Open questions**

- Rate limits and **consent** capture for SMS packet links.

---

## E. Configuration / productization

**Goal:** Packets behave like reusable **products**, not one-off admin scripts.

**Planned capabilities**

- **Packet builder UX** — ordering, labels, optional/required steps, preview.
- **Branded public packet UX** — org logo, colors, copy blocks (within accessibility constraints).
- **Presets** by industry / work unit (still **data**, not hardcoded vertical branches in code).
- **Reusable intake patterns** exportable across orgs (where tenancy policy allows).

**Acceptance**

- New packet definitions can be authored by **non-engineering** roles for at least one pilot vertical.

---

## F. AI agent layer

**Goal:** AI assists staff; **does not** silently change CRM or legal records.

**Planned capabilities (examples)**

- Draft **packet email** copy from context (person-first, opportunity metadata).
- **Summarize** submitted packet for handoff notes.
- **Highlight mismatches** (name, DOB, address) vs CRM and vs other steps.
- Recommend **field updates** as **proposals** (ties to **A**).
- Monitor **stalled** packets; suggest **correction request** wording.

**Acceptance**

- Every AI-suggested mutation is previewable and **explicitly accepted** by a human with org permissions.

---

## G. Queue / operations

**Goal:** Front office sees work, not only individual drawers.

**Planned capabilities**

- Queues / workspace lanes: **completed packets needing review**, **stale / no-open**, **correction needed**, optional **SLA / Needs Attention** integration.
- Assignment / ownership on **`form_packet_sessions`** (or derived views).

**Acceptance**

- A triage user can clear a daily queue **without** scanning every opportunity manually.

---

## Recommended sequencing

1. **B + C (thin slice)** — better review readability + non-PDF submission surfacing (reduces support load before DCP).
2. **A (DCP core)** — proposal model + per-field approve/reject + audit trail.
3. **D** — templates + reminders + webhook/deliverability hardening (depends less on DCP but benefits all outbound).
4. **G** — operational queues once review objects are stable enough to index.
5. **E** — builder/branding once flows are stable (avoid redesigning UX every sprint).
6. **F** — AI layered where prompts have stable context (after A/B produce structured payloads).

Swap **D** earlier if deliverability is blocking pilots.

---

## Phase 2 overall acceptance criteria

- [ ] Operators can **trust** what they see in review (diffs + documents + comms state).
- [ ] **No silent CRM promotion** from public values; DCP or equivalent for field-level promotion where needed.
- [ ] **Activity / Documents / Communications** remain the **correct** surfaces — no duplicate “enrollment app.”
- [ ] Pilot org can run **repeatable** packet deployments with **templates + queues** without engineering hotfixes.

---

## Open questions (cross-cutting)

- Legal **retention** for withdrawn/rejected proposals vs submitted payloads.
- **Multi-tenant** template sharing and PII in example bodies.
- Cross-vertical **packet marketplace** (if ever) vs org-private libraries — product boundary.

---

## Related docs

| Topic | Doc |
|-------|-----|
| As-built forms + documents | **`docs/product/documents-and-forms.md`** |
| CRM surfaces + doctrine | **`docs/product/crm-system.md`** |
| Communications + webhooks | **`docs/product/communications.md`** |
| Sprint comms QA / matrix | **`docs/sprints/archive/05_2026/communications.txt`** |
| Historical packet audit (Card 0) | **`docs/sprints/archive/05_2026/enrollment_journey_packet_operations_v1.md`** |
| Long-range forms vision | **`docs/product/documents-and-forms.md`** (long-term vision) |
| Roadmap tracking | **`docs/execution/roadmap-and-gaps.md`** |
