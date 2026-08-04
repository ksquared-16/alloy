---
owner: sprint
status: active
sprint: assignment-card-model-correction
slot: 6
last_reviewed: 2026-08-04
---

# Cardinality investigation — decision

## Investigated

Whether the Focus Panel Assignments card must become a multi-entry collection so a child can show Preschool + Before Care + Soccer Shots concurrently.

## Finding

Backend already supports concurrent services via `schedule_assignments`, operational assignment types, and secondary assignment creation (`is_primary: false`). No schema change was required for concurrency.

## Decision (rejected over-correction)

Turning the Assignments Focus Panel card into a collection of all interests and concurrent service rows was a **product over-correction**.

**Reverted:** `3238489b1` (and its revert commit on this branch).

## Chosen surface model

The card presents **one coherent operational offer** currently being proposed or committed in this enrollment context — not an inventory of every interest or concurrent service relationship.

Parent interest in multiple services belongs on child/enrollment and appropriate site/service surfaces. Concurrent assignments remain accessible through existing operational surfaces and underlying OA records.
