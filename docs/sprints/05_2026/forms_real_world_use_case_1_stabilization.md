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

## Final polish (May 2026)

### Duplicate public title

Root cause: composition mode rendered both the page header h1 and the composition doc-heading h1; legacy section mode could repeat section titles.

Fix: suppress matching h1/h2 composition blocks; skip outer header when composition already includes the title; suppress section headings equal to form title.

### Duplicate contact match doctrine

Root cause: email match auto-operationalized without comparing submitted guardian name to the matched CRM person; existing opportunity dedup could attach silently.

Fix: after email/phone match, compare names. On mismatch → review required, no auto-operationalize, skip opportunity dedup attach, operator copy shows submitted vs matched names.

Rule: **any email/phone match requires review unless submitted name exactly matches the existing person record.**

### Testing is optional

Setup rail no longer treats Test as required. `liveReady` when publish + configured share link. Test panel is **Optional preview / test** with warning that submissions create real intake records.

### Archive form (UI)

**Archive form** in Form Detail (replaces hard delete in UI):

- `POST /api/admin/forms/[formId]/archive`
- Sets `is_active = false`, deactivates public links, preserves submissions
- Hidden from default Forms list; public embed rejects archived forms

### Lead routing display

Primary setup shows **Lead routing**: school/site, pipeline, starting status.

## Location-specific share links + duplicate form (May 2026)

### Doctrine

- **Do not** duplicate the whole form definition just to route to different locations.
- Same questions + different location = **same form**, **different public/share links**.
- Each link stores its own `default_location_id` (and optional work unit) in `form_public_links.metadata`.
- **Duplicate form** is for reuse/variations — not the primary multi-location pattern.

### Location-specific links

**Share form → Location-specific links** (also under Advanced → Manage all share links):

1. Publish the form and set **Capture new enrollment lead**
2. **Create location-specific link** with:
   - Link name (e.g. `Website Inquiry — West Campus`)
   - Location / site
   - Optional pipeline (defaults to enrollment routing)
3. Copy iframe embed code immediately after creation (token shown once)
4. Repeat for each Firefly site (West, North, Riverbend)

Each link gets a unique embed URL. Submissions route opportunities to the link’s location.

Setup status (`linkOutcomeConfigured`, lead routing display) is evaluated **per selected link**.

### Duplicate form

**Duplicate form** in Form Detail header:

- `POST /api/admin/forms/[formId]/duplicate`
- Creates `Copy of {Form Name}` with a new key
- Copies latest **draft** schema if present; otherwise latest **published** schema
- Copies form metadata/intent; does **not** copy submissions, public links, or packet sessions
- New form starts as draft-only (unpublished)

### Firefly demo manual steps

1. One **Website Inquiry** form — publish once
2. Create three location-specific links (West Campus, North Campus, Riverbend Campus)
3. Copy each iframe into the matching page on the demo website
4. Submit through each iframe — confirm `new_inquiry` leads show the correct school/site

### Tests

- `web/tests/forms/locationSpecificPublicLinkMetadata.test.ts`
- `web/tests/forms/duplicateFormDefinitionForAdmin.test.ts`
- `web/tests/forms/resolveDemoEnrollmentLeadTestContext.test.ts`

### Demo QA root cause (May 2026)

**Symptom:** `qaEnrollmentLeadOpportunityProof` created submissions but no opportunity; lifecycle script crashed with `invalid input syntax for type uuid: "null"`.

**Root cause:** QA scripts patched public link metadata with `DEMO_CHILDCARE_ENROLLMENT_LEAD_INTAKE_LINK_METADATA`, which hardcodes `default_location_id` to a fixture UUID (`7ce70708-…`) that no longer exists after Firefly multi-site location setup (South/West/North campuses). Opportunity insert failed FK on `location_id`; lifecycle script then passed string `"null"` to activity loader.

**Fix:** `resolveDemoEnrollmentLeadTestContext.ts` resolves the live first active site location, selects the canonical demo link by **token hash** (not `limit(1)`), and both prepare + QA scripts use `ensureDemoEnrollmentLeadPublicLinkMetadata` before submit.

### Share by Location UX (May 2026)

**Doctrine:** One form, many location links — do not duplicate forms per campus.

**Operator flow (Firefly demo):**
1. Build form → choose **Capture new enrollment lead** → publish
2. Confirm **Lead routing** shows the expected school/status
3. Under **Share by Location**, pick West / North / Riverbend → **Create link for location**
4. Copy iframe immediately after each link is created
5. Embed each iframe on the matching Firefly website page

**UX simplifications:**
- Renamed **Share by Location** (was "Location-specific links")
- Link name auto-generated: `{Form Name} — {Location Name}`; table shows campus name only
- Primary create flow is location-only — pipeline/work unit hidden (defaults from enrollment intent)
- Site dropdown uses active `location_type = site` rows for all operators (not admin-only picker)
- Defaults to header location filter when set
- Location filter visible on `/adminV2/forms/**` routes
- Setup page de-emphasizes diagnostics (step rail, after-submit detail, test moved under Advanced disclosures)

## Forms Consumerization pass (May 2026)

**Goal:** Forms should feel like a product for childcare directors, not a system built by engineers. UX and language only — no architecture changes, no new capabilities.

### Operator-first language doctrine

- Primary UI uses enrollment/childcare language (school, inquiry, family, share link).
- Internal keys, slugs, pipeline ids, version numbers, and metadata field names stay out of the primary surface.
- When catalog labels exist, always prefer them over raw keys (e.g. `new_inquiry` → **New Lead**).

### Hidden complexity doctrine

- Versioning, publish history, lifecycle step rail, outcome matrices, routing grids, and technical ids live under **Advanced settings** or nested disclosures.
- Operators edit forms; the system manages versions internally.
- Advanced options remain available — nothing removed, only de-emphasized.

### Simplified form lifecycle doctrine

Primary form detail surface:

1. **Form fields** — edit, save draft, publish changes (no version numbers in primary actions)
2. **Form setup** — purpose, lead routing (school + status), share + share by location
3. **Responses** — count + inbox link

Optional under **Advanced settings:** documents, packet usage, routing configuration, manage all links, publish history, technical details.

### Share by Location — location source fix (May 2026)

**Symptom:** Lead routing showed a campus (e.g. North Campus) while Share by Location said “No active locations found”, rows showed campuses as “Not set up yet”, and the create dropdown was empty — all at once.

**Root causes (three separate bugs):**

| Issue | Cause |
|-------|--------|
| Rows vs dropdown vs API | **Three different location sources** merged in UI: routing label catalog (link UUIDs only), `shareByLocationSites` (`is_active = true` only), header bootstrap (`is_active null OR true`) |
| Empty dropdown | Dropdown used `sitesWithoutLinks`, treating the **general share link** (with `default_location_id`) as a campus link — excluding campuses incorrectly |
| “Not set up yet” | Row status required **sessionStorage embed URL**, not whether a location-specific link exists; general routing ≠ campus embed link |

**Canonical source:** `resolveOrgSiteLocationsForAdmin` — `locations` where `location_type = site` and `is_active IS NULL OR true`, same query for header filter and Share by Location API.

**Link semantics:** Share by Location tracks **`distribution_context: location_specific`** links only. General share link routing (Lead Routing card) is separate.

**Slug display:** `humanizeOperatorSlug` + `distributionLinkLabel` never show raw form keys like `new_enrollment_lead` in primary UI.

### Tests

- `web/tests/forms/shareByLocationPresentation.test.ts` — API unwrap + site merge
- `web/tests/forms/formLifecyclePresentation.test.ts` — operator publish summary labels
- `web/tests/forms/formDetailLifecycleWorkspace.test.tsx` — advanced settings layout

## Related

- Prior authoring blockers: [forms_authoring_stability.md](./forms_authoring_stability.md)
