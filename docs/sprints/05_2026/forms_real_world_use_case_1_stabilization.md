# Forms — Real-World Use Case #1 Stabilization (May 2026)

## Use case

Basic school website inquiry form:

1. Operator creates a form and chooses **Capture new enrollment lead**
2. Publishes fields
3. Uses **Share / Open / Test** from form detail
4. Family submits on the public embed
5. A **new inquiry** (`new_inquiry`) appears in enrollment queues

## Root cause — “intake not configured on this public form”

Operational intent was stored on **`form_definitions.metadata`** (`intake_intent`, `intake_outcome`), but public submit reads **`form_public_links.metadata`**.

Typical operator flow:

1. Choose **Capture new enrollment lead** → PATCH form metadata only (no share link yet)
2. **Get share link** → `POST /api/admin/forms/[formId]/public-links` with `{}` body
3. Link created with empty / minimal metadata (medication-demo defaults only applied for that demo key)
4. Public submit: `linkRequiresLeadCapture(linkMeta)` false → `skipped_intake_disabled`, or lead flags set without `default_vertical_id` → `skipped_missing_config`
5. Form detail UI showed green status from **form intent** while the **selected share link** was unconfigured

## Fix

### Intent → share link (deterministic)

- `mergePublicLinkMetadataForCreate` now merges:
  - form-key demo defaults (medication demo unchanged)
  - `buildOperationalIntentLinkMetadataPatch(readStoredOperationalIntent(form.metadata))`
  - org routing defaults (`default_vertical_id`, enrollment dept/work unit, first site location) via `resolveOrgIntakeRoutingDefaults`
  - client overrides last
- `PATCH` public link fills missing routing when form has stored intent and link has `lead_capture`
- `isOutcomeConfiguredForIntent` requires `default_vertical_id` for enrollment lead / waitlist / operational document

### Truthful setup summary

- `buildIntakeRuntimeOrchestrationViewModel` exposes `linkOutcomeConfigured`, `linkSetupIncomplete`
- Badges and step hints reflect **selected share link** config, not form metadata alone
- Warning: **Setup incomplete — this share link will only save submissions.**

### UX simplification (MVP)

- Primary sections: **Build form**, orchestration panel (purpose / after submit / share), **Recent responses**
- Advanced disclosure: outcome matrix, intake preview, manage all links, packet/send panels (intent-gated), technical details

### Public runtime polish

- Suppress duplicate title when section heading equals form title (composition default + renderer)
- Hide custom/unmapped admin helper text on embed runtime

## Files (main)

| Area | Path |
|------|------|
| Link create merge | `web/lib/forms/intake/defaultPublicLinkMetadata.ts` |
| Org routing | `web/lib/forms/intake/resolveOrgIntakeRoutingDefaults.ts` |
| Outcome truth | `web/lib/forms/intakeRuntimeOrchestrationPresentation.ts` |
| Intent check | `web/lib/forms/operationalIntentTemplates.ts` |
| Public links POST | `web/app/api/admin/forms/[formId]/public-links/route.ts` |
| Public links PATCH | `web/app/api/admin/forms/[formId]/public-links/[linkId]/route.ts` |
| Form detail layout | `web/components/forms/workspace/FormLifecycleWorkspaceLayout.tsx` |
| Public renderer | `web/components/forms/engine/FormEngineRenderer.tsx` |
| Composition defaults | `web/lib/forms/documentCompositionAuthoring.ts` |

## Tests

- `web/tests/forms/defaultPublicLinkMetadata.test.ts` — intent on create
- `web/tests/forms/intakeRuntimeOrchestrationPresentation.test.ts` — setup incomplete / link ready
- `web/tests/forms/operationalIntentTemplates.test.ts` — vertical required for configured outcome
- `web/tests/forms/documentCompositionAuthoring.test.ts` — duplicate title suppression

## Manual QA checklist

1. Create form → **Capture new enrollment lead** → add guardian name/email fields → **Publish**
2. **Get share link** (or create from intent picker)
3. Confirm setup summary: **Intake active**, **Creates lead**, **Link ready** (not “Setup incomplete”)
4. **Open form** from Share → submit test data
5. Confirm: opportunity created, status `new_inquiry`, appears in New Leads queue
6. Intake review does **not** say “intake not configured”
7. Public form shows title once; no CRM/unmapped helper text

## Script validation

```bash
cd web && npx tsx scripts/qaEnrollmentLeadOpportunityProof.ts
cd web && npx tsx scripts/qaEnrollmentIntakeLifecycleCoherence.ts
```

## Readiness

**Use Case #1 is ready** after this change set when:

- Org has childcare vertical + enrollment department/work unit (normal Demo Childcare bootstrap)
- Operator follows intent → publish → share link flow (no manual link metadata editing)

**Existing forms** created before this fix may still have bare share links — re-select **Capture new enrollment lead** or create a new share link to apply defaults.

## Remaining / non-goals

- No realtime queue refresh (nice-to-have deferred)
- No new configuration model; still form metadata + link metadata
- Advanced outcome editor remains under Advanced disclosure

## Related

- Prior authoring blockers: [forms_authoring_stability.md](./forms_authoring_stability.md)
