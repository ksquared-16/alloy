# POS Packet + Parent Submission — Foundation (June 2026)

Branch: `claude/pos-packet-parent-submission-20260622` · Base `b87ad4a1`

Scope of this pass: establish the architecture for the POS Packet / Parent Submission
phase and land the genuinely-new, non-duplicative pieces (Sprint 2 core logic + the
Record Resolution seam) as pure, tested modules. The most important finding is recorded
first because it changes the build plan.

---

## 0. Headline finding — the packet runtime already exists

The requested **Sprint 1 "Packet Runtime Foundation"** (packet model, packet items,
share link/token, status, source/target context, route) is **already implemented at the
platform layer** by the Forms Engine's packet system. Building a parallel `pos_packet_*`
schema would duplicate it and violate the standing guardrails ("keep this generic and
config-driven", "avoid POS-only special cases", "do not build POS-specific duplicate
detection").

Existing tables (`supabase/migrations/20260510120000_forms_packet_foundation.sql`):

| Requested concept (Sprint 1) | Existing implementation |
| --- | --- |
| packet | `form_packet_definitions` (ordered, org-scoped template) |
| packet items | `form_packet_items` (each references a `form_definitions` row + optional pinned version) |
| packet share link / token | `form_public_links` → one `form_packet_sessions` row per link (unique) |
| packet status | `form_packet_sessions.status` (`in_progress`/`completed`/`cancelled`) + `operator_review_status` (`needs_review`/`approved`/`rejected`/`needs_correction`) |
| packet source context | `form_packet_sessions.launch_context` |
| packet target record context | `form_packet_sessions.crm_snapshot` (`person_id`/`customer_id`/`customer_member_id`/`opportunity_id`) |
| public route | `POST /api/public/forms/[token]/submissions` (+ `/submit`), packet-aware via `resolvePublicFormEmbedContext` |
| per-step runtime | `form_packet_session_items` (status + link to `form_submissions`) |
| **collect a field once, reuse everywhere** | `form_packet_sessions.shared_values` + `shallowMergeSharedValues` + `field_source.shared_value_key` |

Key runtime code: `web/lib/forms/packets/formPacketService.ts`
(`ensurePacketSessionForPublicLink`, `advancePacketSessionAfterSubmit`,
`shallowMergeSharedValues`, `syncPacketSessionCrmSnapshotFromSubmission`),
`web/lib/forms/prefill/resolveFormPrefillValues.ts`,
`web/lib/forms/formLaunchFkDerivation.ts`,
`web/lib/public/forms/resolvePublicFormEmbedContext.ts`.

**Decision: no new packet tables. POS reuses the forms-packet engine.** What POS must add
is the *generation* layer (turn POS-generated Alloy form templates into a packet
definition with deduped canonical fields), the *planning* layer (known-vs-missing
prefill), and the *seam* to the future platform Record Resolution layer. This pass lands
those as pure modules.

---

## 1. Correct conceptual model (confirmed)

```
Existing Alloy Record + Alloy Form requirements + Official PDF requirements
   → Packet (generated from Alloy form templates)
   → Parent guided submission (confirm known, provide missing, upload, sign)
   → Structured answers (stored once per canonical key)
   → POS review
   → Official PDF / document output
```

Load-bearing doctrine, and where each lives:

1. Packets are generated from Alloy form templates, never directly from PDFs. → POS
   generation layer assembles `form_packet_items` from `form_definitions`.
2. Fields map to canonical Alloy data keys where possible. → `field_source.field_key`
   (`entity_type` + `field_key`), mirrored by `lib/pos/fieldKeyBinding.ts`.
3. Existing record data prefills the packet. → `crm_snapshot` + `resolveFormPrefillValues`.
4. Parent mostly confirms known info, provides only what's missing. → planning layer
   (`packetPrefill.ts`) classifies known/confirmable vs missing/required.
5. If multiple forms need the same field, collect it once. → canonical dedupe plan
   (`packetFieldPlan.ts`) stamps a shared `shared_value_key`; runtime reuses via
   `shared_values`.
6. The official PDF is an output target, not the source of truth. → `pdf_slot` carried
   per consumer on the plan; never used as dedupe identity.
7. Answers stored as structured data, mapped back to PDF/output. → `form_submissions.payload.values` (per step) + `shared_values` (canonical, once) + `pdf_mapping_json`.
8. No POS-specific duplicate detection. → matching is delegated to the future platform
   Record Resolution layer via the seam (`recordResolverSeam.ts`).

---

## 2. What was implemented in this pass

All additive, pure, no DB changes, no changes to existing flow.

### 2.1 Canonical field dedupe plan — `web/lib/pos/packet/packetFieldPlan.ts`

`buildPacketFieldPlan(forms)` takes the generated Alloy form templates that will become
packet items and produces a **deduped canonical field plan**:

- Dedupe identity per field resolves in order: explicit `field_source.shared_value_key`
  → canonical `entity_type:field_key` → unbound (never merged).
- Fields sharing an identity collapse into one `PacketFieldPlanEntry` with every
  `consumer` (form id, form field id, label, type, required, `pdf_slot`).
- `required` is the OR across consumers (most conservative for the parent).
- `output_targets` preserves each form's `pdf_slot` **separately** from identity.
- Emits the `shared_value_key` the generator should stamp on each consumer field so the
  existing packet runtime reuses the answer across steps.
- Type conflicts across consumers are surfaced as warnings (first type kept); `group`
  fields are skipped (structural).

This is the "form-template-to-packet generation: dedupe repeated fields, map to canonical
keys, preserve PDF mapping metadata separately" requirement (Sprint 2), as a pure planner.

### 2.2 Known-vs-missing prefill — `web/lib/pos/packet/packetPrefill.ts`

`resolvePacketPrefill(plan, snapshot)` classifies each canonical datum as `known`
(parent only confirms) or `missing` (parent must provide), and counts
`required_missing_count` (the parent's minimum work). It accepts a snapshot keyed by
canonical key or `shared_value_key`, treats empty string / whitespace / empty array as
absent, and always treats unbound fields as missing. This is the planning-layer companion
to the runtime `resolveFormPrefillValues` (which maps field-id → value at fill time); here
we reason about canonical *coverage* before a session exists.

### 2.3 Record Resolution seam — `web/lib/pos/recordResolution/recordResolverSeam.ts`

Defines the consumer-side contract POS calls and a deferred stub:

- Reuses the existing platform `IntakeHouseholdCandidate` from `@/lib/intake/types`
  (the "Household Graph"); does **not** redefine it.
- `RecordResolver.resolve(candidate, context) → RecordResolutionProposal`
  (`matched` / `create_proposed` / `ambiguous` / `deferred`).
- `availableMatchSignals(candidate)` is a pure presence check (which of `parent_email`,
  `parent_phone`, `child_name_dob` are available) — it compares against *nothing stored*,
  so it is not matching logic.
- `deferredRecordResolver` performs **no matching**, returns `deferred` + `review_required`,
  and passes through known launch-context FKs. POS wires this today; the platform swaps in
  the real resolver later with zero call-site changes.

### 2.4 Tests

`web/tests/pos/packetFieldPlan.test.ts`, `packetPrefill.test.ts`,
`recordResolverSeam.test.ts` (Vitest, matching the existing `tests/pos` convention).

Validation in this environment: scoped `tsc --noEmit` → **0 errors**; a Node
`--experimental-strip-types` harness mirroring the suites → **17/17 assertions pass**.
Vitest itself cannot run here (missing `@rolldown/binding-linux-arm64-gnu` native binding —
the same documented environment limitation noted in the prior checkpoint); the suites must
be run locally with `npm run test -- tests/pos/` to confirm green before push.

---

## 3. Sprint reconciliation and plan

| Sprint | Status against existing engine | Remaining work |
| --- | --- | --- |
| **1 — Packet Runtime Foundation** | **Already exists** (`form_packet_*` + `form_public_links` + public route). | None new. Document reuse (this doc). |
| **2 — Prefill + Field Deduping** | Mechanism exists (`shared_values`, `crm_snapshot`, prefill); **dedupe planner + known/missing planner landed this pass.** | A generator service that: reads the case's generated form(s), runs `buildPacketFieldPlan`, stamps `shared_value_key` onto the form schemas, creates a `form_packet_definition` + items, then a public packet link. (Thin orchestration over existing admin packet APIs.) |
| **3 — Parent Submission MVP** | Public single-form + packet fill, prefill, shared_values, uploads (`file_ref`), signature placeholders (`signature`), draft save, submit/advance **all exist**. | Section copy / "confirm known vs provide missing" affordance in the renderer driven by `packetPrefill` output; light parent preview. Mostly UI. |
| **4 — POS Submission Review** | `operator_review_status` + warnings + `PATCH .../review` route **exist**. | POS surface to list submitted packet sessions, show confirmed-vs-new answers (use `field_source` + `shared_values` + per-step submission), approve/request-changes wired to existing route. Mostly UI + read model. |
| **5 — PDF/Output Mapping** | `pdf_slot` per field + `pdf_mapping_json` + `ensureGeneratedPdfsForApprovedPacketSession` **exist**; plan preserves `output_targets`. | Populate the official PDF from canonical answers using `output_targets`; verify on the MO500 proving case. |
| **6 — Builder UX Polish** | Builder is thin today. | Headers/section text, multi-field rows (`layout_width: "half"` exists), inline help (`description`), upload block, signature/date placeholders, parent preview. |

### Dependency on the canonical Record Resolution sprint

POS calls `deferredRecordResolver` now. When the platform resolver lands, POS:

1. Builds/receives an `IntakeHouseholdCandidate` (Household Graph) from the submitted
   packet (parent email/phone, child name+DOB, household/opportunity links from
   `crm_snapshot`/`launch_context`).
2. Calls the platform `RecordResolver` instead of the stub.
3. On match → link the packet to the existing lead/household/child (no duplicate lead).
   On no match → Create Lead path. On ambiguous → review queue.

The existing `maybeOpenProcessingCaseFromPacketCompletionSafe` →
`openProcessingCaseFromSource(source_kind: "form_packet_session")` is the integration
point; the resolver decides link-vs-create, POS never matches.

---

## 4. Deferred / explicitly not built (per "do not overbuild")

Advanced drag/drop builder; perfect Word/image reconstruction; full duplicate detection
(delegated to platform resolver); complex conditional logic; multi-language; legal-grade
e-signature; AI auto-approval; perfect flat-PDF overlay editor. No new migrations were
added — the packet runtime is reused, not duplicated.

---

## 5. Guardrail compliance

- Repo boundary respected: all work under `/Users/Kelly/Alloy-Claude`, on a Claude branch;
  no push.
- Existing checkpoint functionality untouched: no edits to the
  PDF → detected fields → generated template flow; new files are additive.
- Generic and config-driven; no POS-only special-case tables; no duplicated matching.
- Small vertical slice with tests; type-checked clean.

> Housekeeping: a scratch `web/tsconfig.__packetcheck.json` was used for the scoped
> typecheck and is untracked (it will not be committed). Remove it locally with `rm`,
> alongside the pre-existing `web/tsconfig.__scoped*.json` / `web/__*.mts` scratch files
> noted in the prior checkpoint.
