# Enrollment Operational Surface — v1 Contract (Frozen)

**Status:** Implementation contract — June 2026  
**Scope:** Enrollment tile only on `/workspace`

---

## Components

| Component | Role |
|-----------|------|
| `OperationalSurfaceCover` | Story + Today's Work + Enter action |
| `OperationalSurfaceWorkLine` | Single enterable Work View row |

## Card data shape

```typescript
operationalStory?: {
  headline: string;
  body?: string;
  healthLabel: string;
  healthTone: "healthy" | "warning" | "critical" | "neutral";
};
todaysWork?: Array<{
  id: string;
  label: string;
  count: number;
  workViewId: string;
  href: string;
}>;
entryHref: string; // unchanged — default process entry
```

## Render rule

If `isEnrollmentLifecycleCard(card)` → render Operational Surface.  
No dependency on queue counts, pipeline WU resolution, or pre-enriched fields.

## Href contract

```
/workspace/work-unit/{slug}?work_view={id}&queue={key}
```

## Explicitly out of v1

- Role visibility config
- Domain ordering config
- Custom colors / layout config
- Admin configuration UI
- Billing, Scheduling, or other process surfaces

## Helpers

- `isEnrollmentLifecycleCard(card)` — render gate
- `ensureEnrollmentOperationalSurfaceCard(card)` — runtime fallback hydration
- `buildEnrollmentOperationalSurfaceFields(...)` — server/client enrichment
