---
owner: platform
status: active
last_reviewed: 2026-07-27
---

# Round 4 — Section derivation contract

## Source of truth

Sections derive from **effective Create Lead intake** gather fields:

`EffectiveCreateLeadIntakeSpec.gatherFields` → `gatherSectionsFromFields` → `{ key, label, fields }`.

Presentation titles (operator language) map by `section.key` only:

| Spec `section` key | Operator title (fallback if key unknown: `section_label`) |
|---|---|
| `person` | Family |
| `child` | Children |
| `context` | Placement & preferences |
| other | Use `section_label`; if residual notes-like fields accumulate, may present as **Additional information** via one documented adapter |

**Adapter rule:** Do not invent fields. Optional regroup of existing `context` fields into “Additional information” only when payload keys match documented note/source set (`source`, `intake_notes`, …) — single helper in `createLeadUnderstandingPresentation` (or sibling), not a second config system.

## Draft

One shared `BosCommandDraft`. Section open/close is **UI state only** (React local or session-ephemeral). Closing a section never clears draft values.

## Section card states

### Summary (closed)

- Title + short helper
- Completion: ready | missing required count | optional
- Business summary lines (resolved labels, no IDs/keys)
- Affordance: Open / Add details / Edit

### Edit (open)

- That section’s fields only via gather fields (`chrome="quiet"`)
- Section-scoped missing required copy
- Done closes to summary (does not Confirm the command)

## Default open rules

1. If Family (`person`) has missing required payload keys → Family opens by default.
2. Optional sections start collapsed unless draft already has values for that section (summary populated; still collapsed).
3. Pinned: at most one section open at a time (opening another closes the prior).
4. Expanded: prefer one open; allow a second only if already open from Conversation populate + operator Edit — keep calm (default: one).

## Summaries

Project from draft values + gather field labels + cascade option labels (site/program/room). Omit empties. Support multiple children if draft model carries them; today Create Lead draft is primarily single-child fields — summarize what exists without inventing multi-child storage.

## Review / Success

Reuse the same group titles and summary projection. No field-key dumps.
