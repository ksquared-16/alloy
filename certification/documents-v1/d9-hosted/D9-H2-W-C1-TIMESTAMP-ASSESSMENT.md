# D9-H2 W-C1: can the timestamps prove audit-before-action?

Documents, 2026-11-09, at `5bd35cbdb`. Read against the served code (staging `5db26b46`). This is about the four effect
kinds in `d9w-write-audit-census.sql` (`c6e455e3…`) that store no audit id: review, validity, link/unlink and the 24 h
escalation. Upload, filing, archive and restore store their audit id and are not in question. No product change is
proposed until Kelly decides (§4).

## 1. Where the timestamps come from

| Side | Column | Source | Precision |
|---|---|---|---|
| Audit (all four kinds) | `workflow_events.created_at` | column DEFAULT `now()`; `emitEvent` (`web/lib/emitEvent.ts:22-46`) never passes it. It passes `occurred_at` from the Node clock, which the census does not read | `timestamptz`, µs |
| review / validity | `document_version_review_events.created_at` | DEFAULT `now()`; the RPC insert omits it (`20261217090000_documents_d9_3_archive.sql:353`, `:392`); the table refuses UPDATE | µs |
| link | `document_subjects.created_at` | DEFAULT `now()` (`20261208090000_documents_d2_canonical_foundation.sql:463`) | µs |
| unlink | `document_subjects.ended_at` | `SET ended_at = now()` inside `document_unlink_subject` (d2 `:487`); never app-supplied | µs |
| escalation | `processing_cases.created_at` | DEFAULT `now()` in `open_processing_case_with_primary_source` (`20261215093000…:53`). The app-clock `escalated_at` is not compared | µs |

Every comparison is between two values of one clock (the database's), and none of them comes from the app.

## 2. Order of writes, and ties

On all four paths, the audit row is a separate PostgREST request that is awaited before the effect's RPC starts:
- review: `externalDocumentLifecycle.ts:95` → `:105`
- validity: `externalDocumentLifecycle.ts:145` → `:156`
- link / unlink: `externalDocumentWrites.ts:298` → `:310`/`:311`
- escalation: `unfiledApiUploadEscalation.ts:237` → `:253`

`now()` is the transaction start time. So the effect's `now()` is later than the audit's by at least one network round
trip, and a tie is not expected. A tie could only come from the database clock failing to advance. A backward clock
step (NTP) would give a false **fail**, not a false pass. `workflow_events` has no sequence or identity column
(`uuid` v4 PK), so there is no monotonic key to use instead.

**Verdict on order:** the timestamps reliably prove that *a* matching audit row was committed before the effect.

## 3. Why that is still not W-C1

W-C1 needs *each effect's own* audit row to come first. The census asks only `exists(audit … created_at <= effect)`,
so any earlier matching audit row covers an effect. The served code leaves audit rows with no effect:
- validity: an unchanged call (`changed:false`, d9_3 `:387`)
- link / unlink: a no-op link or unlink (d2 `:458`, `:482`), and earlier link → unlink → relink cycles on one subject
- review: a review the RPC refuses
- escalation: `case_open_failed` / `held`

One stray audit row can therefore cover a later effect that had none. Two more defects:
- **Filing contexts (false fail).** `document_file` links every `contexts` entry inside the filing transaction (d9_3
  `:178-179`) and writes `document_filing_authorized`, not `document_subject_changed`. A write-app filing with contexts
  fails `d9w_c1_link_audit_first` even when correct. The current driver files with `primary` only
  (`d9_hosted_write_cert.py:424`), so the planned run does not hit it. The census is still wrong in general.
- **`<=` admits a tie.** Given §2, a tie is never a legitimate order.

## 4. Smallest reliable alternative (proposed; nothing changed)

**A. Census-only (recommended first; no product change, no migration).** In `d9w-write-audit-census.sql`:
1. Use `<` instead of `<=` for the four timestamp-linked kinds.
2. **One audit row per effect.** Per (kind, document, version or subject), order the effects by time (`lag()`). Each
   effect must have a matching audit row strictly after the previous effect of the same key and strictly before it.
   No audit row can then cover two effects, and a stray audit row cannot stand in for a missing one after its effect.
3. **Filing contexts.** A non-primary `document_subjects` row whose `created_at` equals its document's
   `metadata.filing.filed_at` was written in the filing transaction (same `now()`). It inherits the filing's
   id-linked audit (`metadata.filing.audit_event_id`).

With this, W-C1 is proven per effect for the order of writes. One gap remains: an audit row followed by a refused or
no-op effect, then a real effect, can still pair with the stray row. Only an id closes that.

**B. Escalation id (no migration).** `processing_cases.metadata` is `jsonb`, and `recorded.eventId` is in scope where
`annotateCase` runs (`unfiledApiUploadEscalation.ts:246-267`). Writing `api_upload_escalation.audit_event_id` there
follows the existing `resolution_audit_event_id` (`:340`). It is a product change and needs your approval.

**C. Review / validity / link ids (migration).** `document_version_review_events` and `document_subjects` have no jsonb
column. An id needs a new column plus a `p_audit_event_id` parameter on four RPCs, like filing and archive, or the
`document_malware_audit_event_matches` pattern. This is the only route to id-level proof for those kinds.

**Recommendation:** A now, as a census change before the run. B only if you want escalation proven by id. C only if W-C1
must name the authorizing row for every effect. A changes no promoted bytes: the census runs from the lane worktree as a
generic `database.read_census` and is not a plan pin.
