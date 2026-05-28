# Forms Authoring Stability Sprint

**Date:** May 2026  
**Status:** Blocker fixes implemented (Use Case #1 — Website Inquiry Form)  
**Prior audit:** [`forms_authoring_stability_audit.md`](./forms_authoring_stability_audit.md)

**Scope:** Reliability fixes only — no new Forms features, packets, or AI.

---

## 1. Fixes implemented

### Blocker 1 — Publish saves first (Option A)

**Root cause confirmed:** `publishDraft()` POSTed to `/publish` without PATCHing local React schema. Published version reflected last DB save (often `emptyFormSchema` starter only).

**Fix:** `FormSchemaWorkspace.publishDraft()` now:

1. Validates at least one question exists
2. Calls `persistDraft()` (PATCH with `patchSchemaComposition` payload)
3. Only then POSTs `/publish`

**Files:** `web/app/admin/forms/FormSchemaWorkspace.tsx`

**Server guard:** Publish route rejects empty `fields` array with `400 Add at least one question before publishing`.

**Files:** `web/app/api/admin/forms/[formId]/versions/[versionId]/publish/route.ts`

---

### Blocker 2 — Open / Test gating

**Root cause confirmed:** Share links could be minted and `embedUrl` stored in session storage before any published version existed. **Open form** rendered whenever URL was present; public resolve returned `NO_PUBLISHED_VERSION`.

**Fix:** `FormIntakeRuntimeOrchestrationPanel` now:

- Shows **Open form**, **Copy link**, **Refresh test result**, and embed snippet only when `hasPublished === true`
- Shows hint: “Publish your form before opening or sharing the public link.” when unpublished
- **Get share link** disabled until published

**Note:** `FormLifecycleWorkspaceLayout` already disabled **Preview fields** when `!hasPublished`.

**Files:** `web/components/forms/admin/FormIntakeRuntimeOrchestrationPanel.tsx`

---

### Blocker 3 — No auto-seeded Child First Name

**Root cause confirmed:** `emptyFormSchema()` inserted `OPERATIONAL_FORM_SYSTEM_FIELDS[0]` (`child_first_name`).

**Fix:**

- `emptyFormSchema()` returns zero fields, empty `field_ids`
- Schema validation allows `fields: []` on drafts (`formSchemaV1Schema` — removed `.min(1)` on top-level fields)
- Publish still requires ≥1 field (client + server)

**Files:** `web/lib/forms/adminFormSchemaBuilder.ts`, `web/lib/forms/schema.ts`

---

### Blocker 4 — Kind / Category hidden from basic create

**Fix:**

- Forms hub create panel: Name + Description only by default
- **Advanced settings** disclosure for Kind (center/state) and Category
- Create API defaults `kind` to `center` when omitted

**Files:** `web/app/admin/forms/FormsHubClient.tsx`, `web/app/api/admin/forms/route.ts`

---

### Blocker 5 — Field ordering verification

**Repro test added:** Sequential add of fields A, B, C, D via the same composition path as **Add question to section** preserves order `field_a … field_d` in both composition region and `sections[0].field_ids`.

**Finding:** No append-order bug found in code. Prior report likely conflated with Issue 1 (published stale schema) or unwanted starter field.

**Files:** `web/tests/forms/documentCompositionUsability.test.ts`

---

### Nice-to-have — Operator language

| Before | After |
|--------|-------|
| New blank draft | **New form** |
| Save draft | **Save** |
| Publish draft | **Publish form** |
| New draft from published | **New version from published** |

---

## 2. Root cause confirmation

| Issue | Confirmed? | Evidence |
|-------|------------|----------|
| Publish without save | Yes | `publishDraft` had no PATCH before POST; audit + code |
| Open before publish | Yes | `embedUrl` gated only on link id, not `hasPublished` |
| Auto child field | Yes | `emptyFormSchema` used registry index 0 |
| Kind/Category noise | Yes | No runtime branching; exposed at create |
| Reverse field insert | No bug in append paths | Vitest sequential A–D test passes |

---

## 3. Tests run

```bash
cd web && npm run test -- \
  tests/forms/adminGeneratedKeysAndSystemFields.test.ts \
  tests/forms/documentCompositionUsability.test.ts \
  tests/admin/formsAdminRoutes.test.ts
```

**Result:** 52 passed (3 files)

**New/updated cases:**

- `emptyFormSchema` — zero fields
- `defaults kind to center when omitted on create`
- `rejects publish when draft has no questions`
- `appends fields in add order when simulating sequential add-question (A B C D)`

```bash
cd web && npx tsc --noEmit
```

**Result:** Pre-existing unrelated TS errors elsewhere in repo; **no errors in touched Forms authoring files** (verified via targeted tests + lint on changed paths).

---

## 4. Browser validation steps (Use Case #1)

### Setup

1. Admin → Forms → Create form: **Website Inquiry** (no advanced settings needed)
2. Open form workspace

### Authoring

3. Click **New form** — confirm **no** pre-filled Child first name
4. Set intent: **Capture new enrollment lead**
5. Add questions (map system fields or custom):
   - Guardian first name (Parent first name)
   - Guardian last name
   - Guardian email
   - Guardian phone
   - Interest / tour notes (Message)
6. Confirm **Open form** / **Copy link** are **not** shown (or show publish-first hint)

### Publish

7. Click **Publish form** **without** clicking Save first
8. Confirm success banner; status shows Published

### Runtime

9. **Get share link** → **Open form** → public form shows all five fields in add order
10. Submit test response with valid email/phone

### Downstream (requires demo org intake config)

11. Confirm opportunity created (`new_inquiry` / enrollment pipeline)
12. Confirm lead visible in New Leads queue / intake workspace
13. Confirm submission appears in intake inbox (not stuck in drafts)

---

## 5. Use Case #1 readiness

| Criterion | Status |
|-----------|--------|
| Publish persists editor content | **Ready** — save-before-publish |
| Public form matches editor | **Ready** — same fix |
| Empty start (no child field) | **Ready** |
| No Kind/Category friction on create | **Ready** |
| Cannot open unpublished runtime | **Ready** |
| Field append order | **Ready** — no bug found |
| End-to-end opportunity + New Leads | **Requires manual browser pass** on target org (steps above) |

**Verdict:** Authoring reliability blockers are **addressed in code**. Full Use Case #1 sign-off depends on one manual browser run against Demo Childcare (or target org) with enrollment lead outcome configured on the share link.

---

## Files changed

| File | Change |
|------|--------|
| `web/app/admin/forms/FormSchemaWorkspace.tsx` | Save-before-publish; operator labels |
| `web/lib/forms/adminFormSchemaBuilder.ts` | Empty starter schema |
| `web/lib/forms/schema.ts` | Allow zero fields on draft schema |
| `web/app/api/admin/forms/[formId]/versions/[versionId]/publish/route.ts` | Reject empty publish |
| `web/app/api/admin/forms/route.ts` | Default `kind: center` |
| `web/app/admin/forms/FormsHubClient.tsx` | Advanced settings for kind/category |
| `web/components/forms/admin/FormIntakeRuntimeOrchestrationPanel.tsx` | Gate open/copy/test on publish |
| `web/tests/forms/adminGeneratedKeysAndSystemFields.test.ts` | Empty schema test |
| `web/tests/forms/documentCompositionUsability.test.ts` | Field order test |
| `web/tests/admin/formsAdminRoutes.test.ts` | Kind default + empty publish rejection |

---

## Stop line

Do not begin Use Case #2, AI packet generation, or document ingestion in this sprint.

**Suggested commit message:**

```
Fix Forms authoring blockers for website inquiry publish path.

Save schema before publish, gate public open/copy until published,
start new forms empty, and hide kind/category from basic create.
```

---

## Follow-up (intake configuration)

See [`forms_real_world_use_case_1_stabilization.md`](./forms_real_world_use_case_1_stabilization.md) for the form-vs-link metadata split, share-link intent sync, truthful setup status, and public runtime polish.
