# Testing and quality

**Status:** Canonical quality bar (June 2026 rebaseline).

---

## Required checks (TypeScript changes)

```bash
cd web && npx tsc --noEmit
```

Required before merge on any `web/` TypeScript change.

---

## Module imports (staging deploy)

```bash
cd web && npm run verify:module-imports
```

When adding new `@/lib/**` imports.

---

## Lint

```bash
cd web && npm run lint
```

---

## Focused tests

```bash
cd web && npm run test -- <path>
```

Add/update tests when touching shared behavior, API contracts, permissions, forms, communications, or queues.

---

## AdminV2 runtime doctrine suite

**Required** when editing runtime-sensitive drawer/queue/reveal files:

```bash
cd web && npm run test -- \
  tests/admin/drawer/drawerDeterminism.test.ts \
  tests/admin/drawer/composedDrawerPayload.test.ts \
  tests/admin/drawer/drawerAboveFoldCoordinatedReveal.test.ts \
  tests/admin/drawer/opportunityDrawerHeaderActionsRestore.test.ts \
  tests/adminV2/workUnitQueueLaneRevealState.test.ts \
  tests/adminV2/workUnitPageRevealPolicy.test.ts \
  tests/adminV2/workUnitCoordinatedRevealRegression.test.ts \
  tests/lib/workspace/routeSessionCacheAndReveal.test.ts
```

Locked baseline: `../../system/adminv2-runtime-performance-doctrine.md`

---

## Domain QA scripts

Examples in repo:

- `qa:waitlist:ranking` — waitlist position validation
- Lifecycle/business process: browser verification at `/admin/settings/lifecycle`

---

## Documentation quality

Behavior changes require matching platform doc update in same PR.

---

## Related

- `implementation-patterns.md`
- `design-and-operational-doctrine.md`
