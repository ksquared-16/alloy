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

## QA artifact cleanup (May 2026)

### Root cause — New Leads queue pollution

| Artifact | Source script | Guardian name | Email pattern |
|----------|---------------|---------------|---------------|
| Jordan Enrollment Lead | `qaEnrollmentLeadOpportunityProof.ts` | `Jordan Enrollment Lead` | `ic56-lead-proof-*@example.com` |
| Jordan Lifecycle Coherence | `qaEnrollmentIntakeLifecycleCoherence.ts` | `Jordan Lifecycle Coherence` | `lifecycle-coherence-*@example.com` |

Both scripts **submit a real public form** (create draft → submit). Intake creates:

| Table | Rows |
|-------|------|
| `form_submissions` | 1 submitted row per run |
| `opportunities` | 1 lead (`status_key: new_inquiry`) → **New Leads queue** |
| `persons` | Guardian person (`@example.com`) |
| `customers` | Household customer |
| `customer_persons` | Link person ↔ customer |
| `opportunity_persons` | Link person ↔ opportunity |
| `workflow_events` | `form_submitted`, `intake_case_created`, `intake_case_operationalized` |

**Location-specific link creation does NOT create any of the above** — only `form_public_links` (+ metadata). Side effects happen on **family submit**, not link mint.

### QA artifact cleanup doctrine

- QA gate scripts must **not pollute operational queues** by default.
- After successful assertions, scripts call `cleanupFormsQaRunArtifacts` unless `--keep-artifacts`.
- Manual cleanup: `web/scripts/cleanupFormsQaArtifacts.ts` (dry-run default, `--confirm` to delete).

```bash
cd web
# Dry-run — list matching QA rows
npx tsx scripts/cleanupFormsQaArtifacts.ts --org-id 93667019-bd28-49b5-a688-acc9bb1e0a19

# Remove QA artifacts
npx tsx scripts/cleanupFormsQaArtifacts.ts --org-id 93667019-bd28-49b5-a688-acc9bb1e0a19 --confirm

# Archive to lost instead of hard delete
npx tsx scripts/cleanupFormsQaArtifacts.ts --org-id 93667019-bd28-49b5-a688-acc9bb1e0a19 --confirm --archive-only
```

Fingerprints: `web/lib/forms/formsQaArtifactFingerprints.ts`  
Cleanup logic: `web/lib/forms/cleanupFormsQaArtifacts.ts`

Refuses `VERCEL_ENV=production`.

### UI deletion gap

**Existing:** Opportunity drawer supports **Mark lost** (`mark_lost` action) for appropriate lifecycle stages — removes lead from active pipeline lanes.

**Not in scope:** No dedicated “delete test lead” or bulk QA purge in UI. Use cleanup script for QA artifacts; use Mark lost for one-off operator dismissal.

## Contact Us vs Schedule a Tour (May 2026)

### Doctrine

A **website inquiry is not a tour**. Families are requesting more information; staff review and outreach may lead to a tour as a **next workflow step**.

Use Case #1 copy should say:

- Contact us
- Request more information
- Get more information

Avoid **Schedule a Tour** on:

- Firefly demo website CTAs and contact pages
- Website inquiry form titles (operator-authored, but guidance applies)
- Primary Forms setup language for enrollment lead capture

Tour scheduling remains a valid **later** enrollment workflow action — not the initial public embed promise.

### Copy updated (Firefly demo)

| Surface | Before | After |
|---------|--------|-------|
| Header / hero CTA | Schedule a Tour | Contact Us |
| `/contact` title | Schedule a Tour | Contact Us |
| Campus embed pages | Schedule a Tour — {campus} | Contact Us — {campus} |
| Bottom CTA | Schedule a tour… | Get more information… |

## Field mapping audit — website inquiry (May 2026)

### A. Fields available to form authors (system field registry)

Grouped by operational target:

#### Person / Guardian (`entity_type: guardian`)

| Picker label | Field key | CRM mapping |
|--------------|-----------|-------------|
| Guardian first name | `guardian_first_name` | `guardian.first_name` |
| Guardian last name | `guardian_last_name` | `guardian.last_name` |
| Guardian email | `guardian_email` | `guardian.email` |
| Guardian phone | `guardian_phone` | `guardian.phone` |

#### Child / Customer member (`entity_type: child`)

| Picker label | Field key | CRM mapping |
|--------------|-----------|-------------|
| Child first name | `child_first_name` | `child.first_name` |
| Child last name | `child_last_name` | `child.last_name` |
| Child date of birth | `child_date_of_birth` | `child.date_of_birth` |

**Progressive enrichment:** Child fields are optional at initial website inquiry. They populate `payload.meta.intake.child` when present and may create `customer_members` + `opportunity_customer_members` when auto-create flags allow.

#### Opportunity / Inquiry (`entity_type: opportunity`, `enrollment`)

| Picker label | Field key | Writes to |
|--------------|-----------|-----------|
| Inquiry message | `opportunity_interest_notes` | Submission values (intake note promotion TBD) |
| Preferred school / site | `child_site` | Intake child hint → OCM placement when child captured |
| Desired program | `desired_program_type` | Intake child hint / OCM metadata |
| Desired schedule | `desired_schedule_type` | Intake child hint / OCM metadata |
| Desired start date | `desired_start_date` | Intake child hint / OCM metadata |
| Program / room preference | `program_room_preference` | Intake child hint / OCM cohort |

**Location routing** for Use Case #1 is primarily via **share link** `default_location_id` (Share by Location), not a form field.

#### Inquiry children vs opportunity children

| Concept | What it is |
|---------|------------|
| `payload.meta.intake.child` / `children[]` | Transient intake hints built at submit from mapped form values |
| `customer_members` + `opportunity_customer_members` | Operational child rows created when intake auto-create + child hints present |
| Legacy `inquiry_children` | Not a separate table — intake hints are the bridge; OCM is authoritative for enrollment child context |

### B. Website inquiry field mapping table

| Form field | Field key | Writes to | Current behavior (after fix) | Expected behavior |
|------------|-----------|-----------|------------------------------|-------------------|
| Guardian first name | `guardian_first_name` | `person.first_name`, opportunity name | Mapped via default intake paths → `meta.intake.guardian` → person insert / opp name | ✓ |
| Guardian last name | `guardian_last_name` | `person.last_name`, opportunity name | Same | ✓ |
| Guardian email | `guardian_email` | `person.email`, match key | Default path | ✓ |
| Guardian phone | `guardian_phone` | `person.phone`, match key | Default path | ✓ |
| Inquiry message | `opportunity_interest_notes` | Submission `values` | Stored on submission; visible in intake review | Preserved as evidence |
| Location | *(share link)* | `opportunity.location_id` | From `form_public_links.metadata.default_location_id` | ✓ per campus embed |
| Child fields | `child_*` | OCM when auto-create on | Optional; not required for UC1 | Progressive enrichment |

Custom / unmapped fields remain **submission-only** unless mapped via system field registry.

### C. Root cause — guardian name missing on opportunity

**Observed:** Form captured Guardian First Name and Guardian Last Name; opportunity did not show the submitted name.

**Trace:**

1. Public submit calls `buildFormIntakeMetaFromPayload(values, linkMetadata)`.
2. Default intake paths included `guardian_email`, `guardian_phone`, `guardian_full_name` but **not** `guardian_first_name` / `guardian_last_name`.
3. Website inquiry forms use separate system fields (`guardian_first_name`, `guardian_last_name`) — not `guardian_full_name`.
4. Intake meta guardian names were `null` → `applyFormIntakeSafe` created/matched person without submitted names → opportunity `name` fell back to email/phone/`Web intake`.
5. Email match with empty submitted names treated as identity match (`submittedIdentityMatchesPersonRecord` returns true when both submitted names empty) — could attach to existing person without name mismatch review.

**Fix:** Add `guardian_first_name` and `guardian_last_name` to `DEFAULT_FORM_INTAKE_VALUE_PATHS` in `buildFormIntakeMetaFromPayload.ts`.

### Field picker UX (May 2026)

Mapped-field picker now groups registry entries:

- **Guardian / Contact** — guardian fields
- **Child** — child fields
- **Inquiry** — opportunity + enrollment planning fields
- **Advanced / CRM** — customer, associate
- **Advanced / Custom** — unmapped custom fields

Primary option labels use `default_label` only (no raw keys).

Registry label updates:

- `opportunity_interest_notes` → **Inquiry message** (`public_intake_safe: true`)
- `child_site` → **Preferred school / site**

## Intake classification doctrine (May 2026)

### Clean lead vs ambiguous lead

| Outcome | Signals | Intake Operations bucket | Operator next step |
|---------|---------|--------------------------|-------------------|
| **Clean auto-created lead** | `created_records`, `intake_auto_operationalized`, person/customer/opportunity linked, `intake_needs_review: false`, no duplicate conflict | **Ready / Healthy** (`auto_operationalized`) — not Needs Action, Needs Review, or Needs Linking | Open lead in **New Leads** opportunity queue |
| **Duplicate / ambiguous** | `intake_identity_name_mismatch`, `ambiguous_contact`, `intake_needs_review: true`, `intake_opportunity_match: ambiguous` | **Needs Review** or **Needs Linking** | Quick Review → confirm match / correct linkage |
| **Intake error / missing routing** | `skipped_error`, `skipped_missing_config`, `intake_work_unit_department_mismatch`, no CRM links | **Needs Action** | Fix link config or manual linkage |
| **Existing-record update** | `matched_email` + `attached_existing`, review per link policy | Review when `intake_needs_review: true`; otherwise Healthy | Continue enrollment on attached lead |

### Successful auto-created leads leave the action queue

When a website inquiry successfully creates person + customer + opportunity, routes to the correct school/work unit, and sets opportunity status (e.g. `new_inquiry`):

- The **opportunity** becomes the operational object.
- Intake Operations may show the submission under **Ready / Healthy** or **Recent**, but must **not** count it as Needs Action / Needs Linking.
- Quick Review shows **Lead created** with **Open Lead** — not “Needs family match” or linkage correction.
- Intake Review page shows connected records and **Open Lead**; linkage UUID/paste workflow is hidden unless review is actually required.

### Implementation

Central helper: `web/lib/forms/intakeEnrollmentLeadClassification.ts`

Wired through:

- `submissionLinkageReviewUx.ts` — inbox linkage badges
- `submissionInboxPresentation.ts` — lane resolution
- `intakeCasePresentation.ts` — KPI buckets and attention reasons
- `intakeQuickReviewPresentation.ts` — Quick Review copy
- `FormSubmissionDetailClient.tsx` — intake review page (hide linkage workflow for clean leads)
- `submissionOutcomeSummary.ts` — document generation gate + recommended next steps

## Related

- Prior authoring blockers: [forms_authoring_stability.md](./forms_authoring_stability.md)
