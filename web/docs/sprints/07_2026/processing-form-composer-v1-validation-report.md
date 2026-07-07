# Processing Form Composer V1 — E2E Validation Report

**Date:** 2026-07-07T20:13:40.908Z
**Branch:** feat/processing-form-composer-v1
**Form ID:** 45d89a07-2305-46c8-be21-cb5c9354c7e3
**Processing case ID:** 44620bc5-ba18-49f7-a5a4-98600763c3d0

## PDF used
tests/fixtures/processing/mo500-3313-school-age-child-health-report.pdf (MO500-style AcroForm generated fixture — official DESE URL returns HTML, not PDF)

## What detected cleanly
- Upload opened processing case 44620bc5-ba18-49f7-a5a4-98600763c3d0
- Detection mode: AcroForm fields detected
- Ignored routing_code absent from generated schema
- Child name split into first + last fields
- Save draft + publish succeeded
- Preview opened: http://127.0.0.1:3000/forms/embed/a6vrZzK5QwAdEIZW7ZLtcZM1H_WkUCHwkqnBoeu_AvA?preview=1

## What required operator review
- Allergy notes → Enrollment subject (health/allergy intent)
- Signature field → Processing only
- Child name → Child subject, first+last representation
- Routing code ignored (packet-only / boilerplate)

## What failed
- (none)

## Builder handoff
- Status: **pass**
- Opens `/adminV2/forms/[id]`: yes

## Schema checks
- Ignored field absent from schema: **pass**
- Child name first+last split: **pass**

## Screenshots
See `docs/sprints/07_2026/processing-form-composer-v1-screenshots/`

## Notes
- Screenshot: 01-workspace-authenticated.png
- Screenshot: 02-document-imported.png
- Screenshot: 03-questions-detected.png
- Screenshot: 04-questions-resolved.png
- Screenshot: 04b-generate-summary.png
- Posted save field labels: Child first name | Child last name | Birthdate | Allergy Notes | Health Good | Parent Signature | Signature Date
- Saved draft field labels: Child first name | Child last name | Birthdate | Allergy Notes | Health Good | Parent Signature | Signature Date
- Screenshot: 05-form-workspace-opened.png
- Generated field labels: Child first name | Child last name | Birthdate | Allergy Notes | Health Good | Parent Signature | Signature Date
- Edited first field label in rich builder
- Added one field via document composer
- Screenshot: 06-form-published.png
- Screenshot: 07-form-preview.png

## Unrelated WIP in commit diff
Focus-panel composer files are **not** in the tracked diff (verified separately).

## Recommendation
**commit**
