# AI agent — semantic layout planner v1 (design only)

**Status:** Design document. **No implementation in this change.** No OpenAI/LLM. No new mutation rails beyond the existing **v1 record overview layout** agent/admin path.

**North star:** A user describes how they want a **record overview** configured in natural language; Alloy produces a **safe, reviewable proposal** that applies only through **`update_record_layout` → `record_overview_layouts`** (job, overview), with strict validation and audit as today.

**Source of truth:** [overview-layout-doctrine.md](../architecture/overview-layout-doctrine.md) · [record-rendering-system-spec.md](../architecture/record-rendering-system-spec.md) · [ai-agent-person-contact-overview-doctrine-v1.md](./ai-agent-person-contact-overview-doctrine-v1.md) (person/contact semantics, header vs people band, unresolved channels) · [ai-agent-record-layout-slice-v1.md](./ai-agent-record-layout-slice-v1.md) · [ai-agent-system-contract.md](../architecture/ai-agent-system-contract.md) · [configuration-doctrine.md](../architecture/configuration-doctrine.md) · [ai-agent-foundation-checkpoint.md](./ai-agent-foundation-checkpoint.md)

---

## 1. Problem statement

### 1.1 What kinds of user requests the planner should support

Users think in **outcomes** and **semantics** (“show contact info,” “customer-first,” “move service up,” “hide money”), not in **config primitives** (`header_keys`, `band_key`, `relationship_group_keys`, item `kind`/`key` ordering).

The planner v1 targets **compositional** requests for the **job record overview** that can still be expressed as **legal mutations** of the existing overview config model: header ordering, band visibility/order, per-band field item order, and relationship group filters.

### 1.2 Why narrow deterministic commands are insufficient

Today’s lab assistant maps **fixed phrases** to **fixed overrides** (e.g. “hide financial band”). That is sufficient for **regression and ops smoke tests**, not for:

- **Multi-intent** utterances (“show X, Y, Z and hide financial”).
- **Synonyms and paraphrase** (“main contact” vs “primary person”).
- **Priority / emphasis** (“more customer-focused,” “put service details higher”) without naming exact keys.
- **Partial specifications** where the user expects sensible defaults for unstated parts.

The semantic planner is the **bridge**: it turns richer language into **one or more constrained operations** that still compile to a **single strict `OverviewLayoutConfigV0`-compatible document** (plus `version` / `expected_config_version`).

### 1.3 Fit in the long-term AI configurator vision

| Layer | Role |
|-------|------|
| **Rails** (v1 overview) | Authoritative write path: strict schema, org scope, audit, RPC. |
| **Deterministic assistant** | Thin command → `structured_override` (proven). |
| **Semantic planner (this doc)** | **Interpretation + resolution + proposal assembly** inside fixed templates. |
| **Future LLM** | Optional **slot-filling / paraphrase expansion** on top of grounded catalogs — never the sole authority on legality. |

The planner **does not replace** the rail; it **feeds** it.

---

## 2. Scope v1

### 2.1 Surface

- **`entity_type`:** `job` (API/agent slots: singular `job`; persistence: `jobs` as today).
- **`surface`:** `overview` only.
- **Artifact:** `record_overview_layouts.config` only.

### 2.2 In scope (examples)

| User request (illustrative) | Planner intent (conceptual) |
|----------------------------|-----------------------------|
| “Show the main contact, their phone, email, address, what service they got” | Resolve fields/groups to **header_keys** and **band items** (e.g. people/summary/service_property); order by priority rules. |
| “Make the overview more customer-focused” | **Reweight** defaults: bump customer/person-related keys and relationship groups; optionally de-emphasize operational noise (within templates). |
| “Put service details higher” | Raise **`service_property`** band in `bands` order; ensure relevant items present in summary/header per rules. |
| “Hide the financial band” | Set `financial` band `enabled: false` (or remove items — policy choice; prefer **enabled** for reversibility). |
| “Show address and next service date” | Map phrases → **system_field** keys (`_location_label`, `_next_schedule`, `scheduled_at`, etc.) in allowed bands. |

### 2.3 Explicitly out of scope v1

- Other entities or surfaces (person drawer, schedule chrome, global `record_layouts`).
- New `band_key` values, new item `kind` strings, or freeform JSON.
- **Operational** actions (reassign job, send message).
- **Mutating** `field_values` / job row truth — layout config only.
- **LLM inference** in v1 deliverable (design allows a later plug-in).

---

## 3. Planning model (stages)

End-to-end pipeline from utterance to apply:

```
user request
    → semantic parsing (intent + slots + soft goals)
    → target surface detection (confirm job / overview)
    → grounding read (current layout row + job overview catalog)
    → field / relationship / band resolution (phrase → allowed keys)
    → proposal assembly (merge policies → candidate config)
    → strict validation + version bump + expected_config_version
    → preview (human + machine-readable)
    → apply via existing v1 overview layout rail (agent POST or admin PUT)
```

### 3.1 Stage details

| Stage | Input | Output |
|-------|--------|--------|
| **User request** | Raw string (possibly multi-sentence). | Stored verbatim for audit/rationale. |
| **Semantic parsing** | Raw string. | **Structured intent graph**: e.g. `emphasis: customer`, `actions: [show_fields, reorder_band, hide_band]`, `mentions: [...]`. In v1 this can be **rule-based** (keyword + pattern) or **small grammar**; LLM later. |
| **Target surface detection** | Intent graph. | `(job, overview)` for v1; if ambiguous, **clarify** or **default** to job overview with low confidence flag. |
| **Grounding read** | `org_id`, target. | Current `record_overview_layouts` row; optional **catalog**: allowed header keys, band catalog, job resolver field keys, relationship group registry. |
| **Resolution** | Mentions + catalog. | **Resolved targets**: `FieldRef[]`, `RelationshipGroupRef[]`, `BandRef[]`, each mapped to **registry IDs** (field keys, `group_key`, `band_key`). |
| **Proposal assembly** | Resolutions + current config + policies. | **Candidate `config`** (full document) or **ordered ops** that reduce to one config; **diff** for preview. |
| **Strict validation** | Candidate config. | Pass/fail via `parseOverviewLayoutConfigStrict` (or equivalent); repair loop only within rules. |
| **Preview** | Valid candidate + rationale. | UI / JSON for review; user edits allowed before apply. |
| **Apply** | `structured_override` + `expected_config_version`. | Unchanged v1 rail. |

---

## 4. Resolution rules

### 4.1 Registries (ground truth)

Planner may only emit:

- **`band_key`** ∈ `{ summary, people, operational, financial, relationships, service_property }` (fixed set per strict schema).
- **Item `kind`** ∈ `{ system_field, custom_field, section }` (+ alias `field` → `system_field` as today).
- **`key`** ∈ **keys the job overview resolver can supply** for the org (union of system keys used in [`job.ts` RRS](../../web/lib/rrs/entities/job.ts) overview path + org custom fields where applicable). **No invented keys.**
- **`relationship_group_keys`** ⊆ `{ primary_customer_person, customer_account }` (job v1 registry).
- **`header_keys`** ⊆ same allowed key set as strict header validation (`^[a-z0-9_:]+$` and semantics from overview doctrine).

Maintain a **versioned catalog document** in-repo (e.g. JSON or TS map): phrase → ranked candidates.

### 4.2 Synonyms (examples — illustrative)

| Phrase family | Resolved targets (priority order) |
|---------------|-------------------------------------|
| “main contact,” “primary person,” “customer contact” | `_primary_person_name`, `people` band items, `primary_customer_person` relationship group |
| “phone,” “email” | Custom/org fields if registered; else **clarify** if no canonical job-level key (job overview may not expose raw phone on header — document per catalog) |
| “address,” “location” | `_location_label`, optional header |
| “service,” “what they booked,” “service details” | `service_property` band, `service_key`, `_service_*` keys per catalog |
| “next visit,” “next service date” | `_next_schedule`, `scheduled_at` (disambiguation: prefer `_next_schedule` for “next” phrasing) |
| “money,” “price,” “total,” “financial” | `financial` band; keys like `display_total_cents` |
| “customer-focused” | Boost: `people`, `relationships`, customer-facing header keys; optionally soften `operational` emphasis (reorder, not delete resolver data) |

### 4.3 Priority order (when multiple mappings hit)

1. **Exact catalog match** (phrase → key).
2. **Known synonym table** (longest match wins within utterance).
3. **Band-level inference** (“service” → `service_property` band before stuffing unrelated bands).
4. **Defaults from current config** (preserve existing order for untouched bands).
5. **Ambiguity:** if two keys tie and both change layout materially → **mark ambiguous**; either **ask clarification** (interactive) or **emit best proposal with low confidence** and list alternatives in rationale (product choice).

### 4.4 Ambiguity handling policy

| Situation | v1 recommendation |
|-----------|---------------------|
| Unknown phrase, no catalog hit | **Exclude** from proposal; list “unresolved: …” in rationale; do not invent. |
| Two equal keys | **Prefer** header vs band placement per doctrine (identity/status in header; narrative in bands). |
| User asks for data the overview cannot show | State **capability gap** in rationale; do not add fake items. |
| “More X-focused” without specifics | Apply **scored template** (deterministic weights) + **confidence: medium**; show diff prominently. |

---

## 5. Proposal shape

Planner output is **review metadata + a single legal config candidate** (or validation error).

### 5.1 Suggested JSON shape (logical)

```jsonc
{
  "planner_version": 1,
  "target": {
    "target_kind": "record_overview_layout",
    "entity_type": "job",
    "surface": "overview"
  },
  "user_request_text": "…",
  "parsed_intent": {
    "emphasis": "customer | operational | balanced | unknown",
    "actions": ["show", "hide", "reorder_header", "reorder_bands", "reorder_items", "set_relationship_groups"],
    "raw_mentions": ["…"]
  },
  "resolution": {
    "fields": [{ "phrase": "main contact", "resolved_key": "_primary_person_name", "confidence": "high" }],
    "relationship_groups": [{ "phrase": "customer account", "resolved_group_key": "customer_account", "confidence": "high" }],
    "bands_touched": ["people", "financial"]
  },
  "rationale": ["Moved service_property above operational per 'higher' directive.", "Unresolved: 'phone' — no canonical overview key."],
  "ambiguity": [{ "phrase": "contact", "candidates": ["_primary_person_name", "primary_customer_person"], "chosen": "_primary_person_name", "reason": "header identity precedence" }],
  "config": { "version": 3, "header_keys": [], "bands": [] },
  "expected_config_version": 2,
  "diff_summary": {
    "header_keys": { "before": [], "after": [] },
    "bands_enabled": { "financial": { "before": true, "after": false } }
  }
}
```

### 5.2 Fields vs full config

- **Preferred for apply:** **full `config`** object (matches current v1 `structured_override.slots.config`) so the rail stays unchanged.
- **Diff** is for **preview only** (human trust + lab UX), computed against grounded `before` snapshot.

### 5.3 Confidence / ambiguity markers

- **`high`:** single catalog hit, no tie.
- **`medium`:** template-based “focus” or reorder heuristics.
- **`low`:** multiple ties; planner picked default — **must** list in `ambiguity` and encourage user edit before apply.

---

## 6. Safety / constraints

| Constraint | Enforcement |
|------------|-------------|
| Fixed overview templates | Only allowed `band_key` / item kinds / registry keys; **strict parse** before apply. |
| No unknown fields/groups | Resolution step **drops** unknowns; rationale lists gaps. |
| No resolver truth mutation | Planner touches **`record_overview_layouts.config` only**; RRS/job data unchanged. |
| Use existing v1 rail | Final payload = today’s agent envelope + `parseOverviewLayoutConfigStrict` success. |
| Reviewable | Preview mandatory in product; lab can require explicit “Apply.” |
| Org scope | Planner runs in **admin org context**; proposals scoped to `ctx.orgId`. |

---

## 7. Deterministic vs future LLM path

### 7.1 Deterministic in v1 (recommended)

- **Synonym tables** and **keyword patterns** for intents (hide/show/reorder/focus).
- **Scoring** for “customer-focused” / “service higher” templates.
- **Merge policy** when combining multiple actions in one utterance.
- **Strict validation** and **diff** generation.

This yields a **testable** planner without model variance.

### 7.2 LLM-assisted later (optional)

- **Utterance → intent graph** slot fill (still validated against catalog).
- **Paraphrase expansion** (“the guy we always talk to” → candidate phrases for resolver).
- **Natural language rationale** summarizing deterministic `rationale[]`.

LLM outputs are **never** written directly to DB; they feed the **same proposal object** that must pass strict validation.

### 7.3 Grounding required before LLM

- Frozen **field / band / relationship catalog** per org (or global job overview catalog + org custom field list).
- **Current layout snapshot** + `expected_config_version`.
- **Policy doc** for ambiguity (clarify vs best-effort).

---

## 8. Build recommendation (phased)

| Phase | Deliverable |
|-------|-------------|
| **P0 — Catalog** | Machine-readable **job overview resolution catalog** (keys, synonyms, band placement hints); unit tests for phrase → resolution. |
| **P1 — Planner core** | Deterministic function: `(requestText, currentConfig, catalog) → proposal object`; fuzz tests; no HTTP. |
| **P2 — Lab integration** | “Semantic preview” panel: paste NL → show proposal + diff → edit → submit **existing** v1 agent POST. |
| **P3 — Product preview UX** | Read-only diff UI for admins; audit log references `user_request_text` + proposal id. |
| **P4 — LLM adapter** | Optional module: NL → intent graph JSON schema; **planner core unchanged**; feature-flagged. |

---

## Output reference (for readers)

### 1. Summary

Semantic planner v1 is a **deterministic interpretation layer** that maps natural **job overview** layout language to **registry-grounded** `record_overview_layouts` configs, with preview and **unchanged v1 apply rail**.

### 2. Supported request categories

Compositional overview requests: **show/hide/reorder** fields and bands, **relationship group** filtering, **emphasis** templates (“customer-focused,” “service higher”), within **fixed templates** only.

### 3. Planning stages

Parse → detect surface → ground → resolve → assemble → validate → preview → apply (v1).

### 4. Resolution model

Phrase → **catalog-backed** field keys, `band_key`, `relationship_group_keys`; synonyms and priority rules; ambiguity surfaced explicitly.

### 5. Proposal model

Structured metadata + **full strict config** + **diff** + confidence/ambiguity markers.

### 6. Safety model

Strict schema, no invention, no truth mutation, org-scoped, review before apply.

### 7. Recommended implementation phases

Catalog → planner core → lab → product preview → optional LLM adapter.

---

*Cross-link when implementing:* update [ai-agent-foundation-checkpoint.md](./ai-agent-foundation-checkpoint.md) with a pointer to this planner doc under “next build sequence.”
