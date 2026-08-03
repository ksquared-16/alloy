---
title: Phase 0 — Pre-existing Test Baseline
status: recorded
date: 2026-07-31
base: origin/staging @ 3fc2e0f4e (plus Phase 0 docs + harness; no production code changed)
---

# Phase 0 — Pre-existing Test Baseline

Recorded so that any failure appearing during Phase 0 is attributable. Per direction, Phase 0 does **not** undertake wholesale repair of these.

## Exact baseline

```
$ npx vitest run tests/communications
Test Files  13 failed | 82 passed (95)
     Tests  25 failed | 607 passed (632)
```

Captured **before** any Phase 0 production change. The harness commit (`58b7d9a7b`) is test-only and does not affect these.

## Failing files

| File | Failures |
|---|---|
| `familyWorkspaceActivityEmbed.contract.test.ts` | 8 |
| `drawerFamilyWorkspacePrefetchTiming.contract.test.ts` | 3 |
| `commsV2RecipientPreviewShape.test.ts` | 2 |
| `commsV2TemplatesSchema.test.ts` | 2 |
| `communicationsWorkspaceWarmCache.test.ts` | 2 |
| `commandCenterShellWarm.test.ts` | 1 |
| `commsV2AnnouncementsSchema.test.ts` | 1 |
| `commsV2AudienceSpecWiring.test.ts` | 1 |
| `commsV2CommandCenterViewModel.test.ts` | 1 |
| `commsV2ConversationCoreSchema.test.ts` | 1 |
| `commsV2DeliveryEventsSchema.test.ts` | 1 |
| `commsV2PreferencesSchema.test.ts` | 1 |
| `commsV2TemplatesAnnouncementsSchema.test.ts` | 1 |

## Why these are non-behavioral

**All 13 files are `readFileSync` + regex assertions on source or migration text.** They assert that code *looks* a certain way, not that it *does* a certain thing. They break when code is refactored and pass when behavior is broken — which is precisely how the P0-1 and P0-4 defects stayed invisible while the suite reported 607 passing tests.

## Verified false positive (sampled)

`commsV2AnnouncementsSchema.test.ts` → *"contains NO destructive DDL and NO send/provider code"*

The assertion is `expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|POLICY|SCHEMA)\b/i)`.

It fails on six lines in `20260622123000_comms_v2_announcements.sql`:

```
87:  DROP POLICY IF EXISTS announcements_select_org ON public.announcements;
92:  DROP POLICY IF EXISTS announcements_service_all ON public.announcements;
97:  DROP POLICY IF EXISTS announcement_targets_select_org ON public.announcement_targets;
102: DROP POLICY IF EXISTS announcement_targets_service_all ON public.announcement_targets;
107: DROP POLICY IF EXISTS announcement_recipients_select_org ON public.announcement_recipients;
112: DROP POLICY IF EXISTS announcement_recipients_service_all ON public.announcement_recipients;
```

**`DROP POLICY IF EXISTS` immediately before `CREATE POLICY` is the standard idempotent-migration pattern — it makes the migration re-runnable.** It is the opposite of destructive. The regex is too blunt to distinguish it from `DROP TABLE`.

**The migration is correct; the test is wrong.** The other 12 files were not individually diagnosed — the sample establishes the category, and the direction is explicit that Phase 0 is not a test-modernization sprint.

## Policy for Phase 0

- These 25 are the accepted baseline. Commit 9 confirms **no new failures**.
- Where a Phase 0 commit touches an area covered by a misleading source-shape test, that **specific** test may be replaced with behavioral coverage — permitted by direction, and already applied in commit 1 (the announcement-targets route is now exercised by real invocation with payload capture rather than a source regex).
- No general modernization.

## New tests added by Phase 0 so far

| Commit | File | Result |
|---|---|---|
| 0 | `tests/harness/harnessSelfCheck.test.ts` | 8/8 (9/9 with `P0_DB_TESTS_ENABLED=true`) |
| 1 | `tests/communications/announcementTargetsCanonicalShape.test.ts` | 8/8 (9/9 with DB enabled) |
