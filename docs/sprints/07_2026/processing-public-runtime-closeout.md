# Processing Public Runtime — Sprint Closeout

**Date:** 2026-07-08  
**Scope:** Public Form Runtime V1 — embed Alloy forms on external sites; submissions enter Processing for review.

## Delivered

### 1. Public form publishing (Processing Studio)

- **Publish inspector** in `ProcessingFormBuilder` via `ProcessingFormDistributionPanel`
- Draft / Published / Archived status derived from form + active processing-intake links
- Public slug stored on `form_definitions.metadata.processing_public_slug`
- Public identifier: link `token_prefix` + form id in metadata
- Share URL + iframe embed copy (one-time mint panel + session-stored URL for copy-after)

### 2. Public runtime

- Reuses existing `/forms/embed/[token]` route and public APIs
- Processing-intake links skip CRM lead-capture defaults
- Studio preview/runtime modes unchanged (local); public runtime uses token embed

### 3. Submission pipeline

- Public submit → `maybeOpenProcessingCaseFromFormSubmissionSafe` with link + version metadata
- Processing case opens when link has `form_context_mode: processing_intake`
- No Lead/Parent/Child/Enrollment auto-create for processing-intake links

### 4. Processing integration

- Queue source channel: **Public form** for processing-intake submissions
- Case status: `received` (operator label: Just arrived)

### 5. Security seams

- Existing token hash, embed origin checks, CSRF on admin paths preserved
- Rate limiting / CAPTCHA remain future seams

## Key files

| Area | Path |
|------|------|
| Link metadata | `web/lib/pos/processingPublicLinkMetadata.ts` |
| Slug + iframe | `web/lib/pos/processingPublicRuntime.ts` |
| Studio distribution UI | `web/app/adminV2/pos/ProcessingFormDistributionPanel.tsx` |
| API hook | `web/app/adminV2/pos/useProcessingFormApi.ts` |
| Case on-ramp | `web/lib/pos/processingCase/maybeOpenProcessingCaseFromFormSubmissionSafe.ts` |
| Queue label | `web/lib/pos/processingCase/readModel/processingCaseReadModelDb.ts` |

## Tests

```bash
cd web && npm run test -- \
  tests/pos/processingPublicLinkMetadata.test.ts \
  tests/pos/processingPublicRuntime.test.ts \
  tests/pos/processingCaseService.test.ts
```

## Out of scope (unchanged)

- Record commit workflow
- OCR / AI extraction
- Packet public runtime
- Conditional logic / payments
- Shell redesign

## Success path

Firefly iframe → parent submits → Processing Work queue → operator reviews → ready for future Commit workflow.
