---
owner: modules
status: canonical
last_reviewed: 2026-07-12
supersedes: []
---

# Operator flow: record linkage review (Forms V1.3)

## What operators see

1. **Submissions list** — a **Linkage** column shows **Needs review** when intake flagged the row or the resolution path needs attention; **Link CRM** when the submission is missing a CRM attach parent for documents.
2. **Submission detail** — a top **amber callout** appears while document generation is blocked by linkage/intake policy, with bullets explaining *why*.
3. **Record linkage review** — **Confirm** when linked rows are already correct; **Correct linked records** when the wrong CRM rows were attached.

## If no CRM row exists yet (create-new)

Alloy does **not** create new persons, customers, child members, or opportunities from the submission linkage panel in this release.

**Today:** create the correct household / child / opportunity in CRM (existing Admin drawers and workflows), note the record IDs, then return to the submission and use **Correct linked records** (admin: Advanced UUID paste) or ask an admin to do so.

**Future (planned):**

- Safe, org-scoped **search picker** for existing entities (reuse a dedicated admin search API with strict filters).
- Optional **guided create-new** from intake only when product rules and audits allow (no duplicate CRM systems).

See also: `docs/forms/existing-record-public-link-contract.md` for launch context metadata.

## Documents

Generated PDFs/stubs are stored as **documents** rows and linked to this submission and to the **CRM attach parent**. Broader **document type / category** surfacing on person, customer, child, and opportunity profiles is follow-on work; operators should open files from the submission’s Documents section or the Documents drawer until then.
