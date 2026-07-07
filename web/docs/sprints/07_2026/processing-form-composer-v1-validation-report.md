# Processing Form Composer V1 — E2E Validation Report

**Date:** 2026-07-07T18:26:23.868Z
**Branch:** feat/processing-form-composer-v1
**Form ID:** 5ba6c3a7-0215-4d47-afae-fbff0d43cc7e
**Processing case ID:** e304678b-7e67-4b5b-9b86-d8755a2938f5

## PDF used
tests/fixtures/processing/mo500-3313-school-age-child-health-report.pdf (MO500-style AcroForm generated fixture — official DESE URL returns HTML, not PDF)

## What detected cleanly
- Upload opened processing case e304678b-7e67-4b5b-9b86-d8755a2938f5
- Detection mode: AcroForm fields detected
- Ignored routing_code absent from generated schema
- Child name split into first + last fields
- Save draft + publish succeeded
- Preview opened: http://127.0.0.1:3000/forms/embed/ie5wOUhv_KGppo7My_uuCtzcc2WwBPZQH32zuzLh9iQ?preview=1

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
