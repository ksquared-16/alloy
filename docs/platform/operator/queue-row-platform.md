# Queue Row Platform

> **Status**: V1 — Foundation complete. Builder wired. Placement signal projected.

The Queue Row Platform mirrors the Focus Panel architecture for operational queue surfaces.
The same doctrines apply: queue row widgets observe a `QueueRowOperationalContext` boundary;
they do NOT consume raw layout runtime records or placement APIs directly.

---

## Architecture

```
buildOperationalQueueRecordViewModel (layout runtime)
  → buildQueueRowOperationalContext (adapter)
    → QueueRowOperationalContext
      → Queue Row Widgets
        → Evidence builders (pure projections)
```

### QueueRowOperationalContext

The forward-facing contract for queue row widgets.

```typescript
type QueueRowOperationalContext = {
  subject: QueueRowSubjectRef;         // type, id, label
  truth: Record<string, unknown>;      // composed record fields
  signals: QueueRowSignals;            // projected operational facts
  capabilities: QueueRowCapabilities; // mutation + placement write permission
  status: QueueRowStatus;
};
```

**Signals**:
- `primaryWork` — most-urgent open work item (mirrors Focus Panel work signal)
- `attention` — needs-attention flag + primary reason
- `tour` — next scheduled tour (date + status)
- `placement` — placement priority rank, tier label, manual override

### Placement Signal

The `QueueRowPlacementSignal` is projected from `record["metadata.placement_priority_v1"]`
(the existing `PlacementPrioritySnapshot` persisted by the placement evaluator). Never
calls placement APIs; never fabricates rank or tier.

```typescript
type QueueRowPlacementSignal = {
  hasPlacementPriority: boolean;
  rank: number | null;          // bucket_priority_order
  tierLabel: string | null;     // bucket_label
  hasManualOverride: boolean;
  overrideLabel: string | null;
};
```

---

## Queue Row Builder V1

Operators configure queue row surfaces at `/settings/surfaces → Queue Rows`.

The builder exposes:
- **Column zones**: household, children, status, attention, date/event, actions
- **Placement override affordance** (waitlist rows only): toggles an inline override
  control on each row; operators with placement write permission set a manual tier

Builder is wired to the existing `QueueRecordLayoutConfigV3` schema. Persistence to
the LayoutDoc is Phase D2.

---

## Surface Registry

Both queue row surfaces appear in the Surface Library with `status: "published"`:

| Surface | ID | Editor |
|---|---|---|
| Pipeline Queue Row | `pipeline-queue-row` | `queue-row-builder` |
| Waitlist Queue Row | `waitlist-queue-row` | `queue-row-builder` |

---

## Phase D2 Roadmap

- Wire builder save to LayoutDoc persistence (same path as Focus Panel Summary editor)
- Evidence builders per zone (household widget, children widget, status widget)
- `QueueRowWidget` components consuming `QueueRowOperationalContext`
- Placement override write path (connects to existing `applyPlacementCandidateOverrides`)
