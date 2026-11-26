---
owner: sprint
status: accepted
sprint: assignment-card-model-correction
slot: 6
last_reviewed: 2026-08-04
---

# Cardinality investigation — decision (accepted)

## Investigated

Whether the Focus Panel Assignments card must become a multi-entry collection so a child can show Preschool + Before Care + Soccer Shots concurrently.

## Finding

Backend already supports concurrent services via `schedule_assignments`, operational assignment types, and secondary assignment creation (`is_primary: false`). No schema change was required for concurrency.

## Decision (rejected over-correction)

Turning the Assignments Focus Panel card into a collection of all interests and concurrent service rows was a **product over-correction**.

**Reverted:** `3238489b1` (revert commit on branch history; tip includes rebased equivalent after `alloy-worktree-sync`).

## Chosen surface model

The card presents **one coherent operational offer** currently being proposed or committed in this enrollment context — not an inventory of every interest or concurrent service relationship.

Parent interest in multiple services belongs on child/enrollment and appropriate site/service surfaces. Concurrent assignments remain accessible through existing operational surfaces and underlying OA records.

## Certification note

Local browser matrix waived under Kelly-approved CI-preview path (host-resource blocker + Vercel SSO on preview). Automated gates: 38/38 focused suites, typecheck, typecheck:tests, Firefly Preview deploy success. See `CI-PREVIEW-CERT.md` evidence.
