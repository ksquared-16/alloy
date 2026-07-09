# Processing Public Runtime — Handoff

## Operator workflow

1. Open **Processing → Studio → Forms**
2. Build or open a form; **Publish** from the toolbar
3. In the **Publish** inspector:
   - **Publish public link** — mints a secure embed token (copy URL + iframe once)
   - **Copy link** / **Copy iframe** — available when URL is in session storage
   - **Republish** — publish a new draft version (existing links serve latest published unless pinned)
   - **Unpublish** — deactivates all processing-intake public links

## Embed on Firefly (or any site)

After minting, copy the iframe HTML:

```html
<iframe src="https://<alloy-host>/forms/embed/<token>" title="Lead Form" style="width:100%;min-height:720px;border:0;" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>
```

- Width: 100% of container
- Height: fixed min-height (720px); auto-resize is a future seam

## What happens on submit

1. Public runtime validates required fields (existing `validateFormPayload`)
2. Submission stored on `form_submissions` with link + version metadata
3. Processing case opened (primary source: `form_submission`)
4. Case appears in **Processing → Work** queue with source **Public form**
5. **No CRM records** created for processing-intake links

## Metadata contract

**Form definition** (on publish):

- `processing_public_slug`
- `processing_public_form_id`
- `processing_intake_enabled: true`
- `source: "processing"`

**Public link** (on mint):

- `form_context_mode: "processing_intake"`
- `pos_connected: true` (link-level gate for case on-ramp)
- `embed_mode: true`
- No `lead_capture` / `intake` flags

## APIs (unchanged routes)

| Action | Route |
|--------|-------|
| List links | `GET /api/admin/forms/[formId]/public-links` |
| Mint link | `POST /api/admin/forms/[formId]/public-links` |
| Unpublish | `PATCH .../public-links/[linkId]` `{ is_active: false }` |
| Public resolve | `GET /api/public/forms/[token]/resolve` |
| Public submit | `POST /api/public/forms/[token]/submissions/[id]/submit` |

## Follow-ups

- [ ] Processing-branded public embed shell (vs enrollment `ParentIntakeShell`)
- [ ] Embed origin allowlist UI in Studio
- [ ] Auto-resize iframe postMessage seam
- [ ] Rate limiting + CAPTCHA on public submit
- [ ] Commit workflow (records after operator approval)

## Validation before merge

```bash
cd web && npx tsc --noEmit
cd web && npm run test -- tests/pos/processingPublicLinkMetadata.test.ts tests/pos/processingPublicRuntime.test.ts tests/pos/processingCaseService.test.ts
cd web && npm run verify:module-imports
```
