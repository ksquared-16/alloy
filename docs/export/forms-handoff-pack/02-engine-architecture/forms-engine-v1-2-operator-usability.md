# Forms Engine V1.2 — Operator usability (manual QA)

**Scope:** AdminV2 Forms hub onboarding, form detail operator guide, public preview, submission outcome summary.  
**Canonical UI:** `/adminV2/forms` and nested routes.

---

## Quick review path

| Area | URL pattern |
|------|-------------|
| Forms hub | `/adminV2/forms` |
| Form workspace | `/adminV2/forms/[formId]` |
| Submissions list | `/adminV2/forms/[formId]/submissions` |
| Submission detail | `/adminV2/forms/[formId]/submissions/[submissionId]` |
| Public embed (after link/preview) | `/forms/embed/[token]` (optional `?preview=1`) |

Use an org that already has at least one form (e.g. medication demo seeded) or follow your environment runbook to seed.

---

## QA checklist for Kelly

### 1. Forms hub (`/adminV2/forms`)

**Steps**

1. Open `/adminV2/forms` while signed in as admin/ops for the target org.

**Expect**

- Header explains Forms in operator language (not only “definitions”).
- **Forms in Alloy** card includes **How Forms usually flow** (5 steps) and states there is **no in-app builder**.
- **Your forms** table shows **Purpose / description** (from `metadata.operator_context.purpose` or DB `description`), **Definition** active/inactive, **Published** (yes/no published version), **Open form workspace** link.

**Empty org**

- If no forms: empty state explains schema/seed configuration, no builder promise.
- In **development** or **Preview** (`NEXT_PUBLIC_VERCEL_ENV=preview`), optional box shows the `demo:seed:medication-form` command; in production deploys, generic “ask administrator” copy only.

---

### 2. Form workspace (`/adminV2/forms/[formId]`)

**Steps**

1. Click **Open form workspace** for a form with a published version.

**Expect**

- Operator guide sections (purpose, who completes, after submit, connected systems, next steps).
- **Preview the public form** creates/reuses preview link; new tab shows embed with amber **Previewing public form** banner when `?preview=1`.
- Public links section explains prefix-only table and one-time token.

---

### 3. Submissions (`…/submissions` → `…/[submissionId]`)

**Steps**

1. Open a submitted row (or submit via embed first).

**Expect**

- **Outcome summary**: status, timestamps, records connected (linked / not linked), document outcome, workflow copy + follow-up note, recommended next steps, technical ids collapsed.
- **Documents & PDF**: list + **Generate document** when allowed.
- **Answers & technical details**: **Answers submitted** + collapsible **Technical payload (JSON)**.

---

### 4. End-to-end smoke (optional)

1. Preview or create link → complete embed → confirm submission appears in list → open detail → generate document if applicable.

---

## Known limitations (V1.2)

- **No form builder** — definitions from migrations/scripts/API; hub copy reflects that.
- **Published column** on hub uses a **single extra query** (published version exists); not a full version history.
- **Workflow events** on submission detail are **descriptive only** — no live event table yet.
- **Preview** mints a real public link (tagged **Admin preview**); tokens are not recoverable for old links.
- **Ops vs admin:** document generation and link creation remain admin-gated where APIs already require it.

---

## Related docs

- `docs/sprints/05_2026/forms-engine-v1-1-usable-flow.txt` — V1.1 foundation and placement.
- `docs/sprints/05_2026/forms-engine-v1.txt` — engine freeze / architecture references.
