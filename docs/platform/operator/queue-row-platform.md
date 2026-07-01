# Queue Row Platform

> **Status**: V1 — Builder persistence wired. Zone toggle → publish → runtime reads config. Placement signal projected. Grain model applied (Sprint 5).

The Queue Row Platform mirrors the Focus Panel architecture for operational queue surfaces.
The same doctrines apply: queue row widgets observe a `QueueRowOperationalContext` boundary;
they do NOT consume raw layout runtime records or placement APIs directly.

---

## Grain Model

Every queue row declares a grain. Three grains exist (see [Operational Grain Doctrine](operational-grain-doctrine.md)):

| Grain | Subject type | Builder |
|---|---|---|
| `"case"` | `opportunity` | `buildQueueRowOperationalContext` |
| `"child"` | `opportunity_customer_member` | `buildChildGrainQueueRowOperationalContext` |
| `"candidate"` | `placement_candidate` | `buildCandidateGrainQueueRowOperationalContext` |

Grain is set on `QueueRowSubjectRef.grain` and never mutated after construction. Context
builders are pure functions — no runtime grain switching.

---

## Architecture

```
buildOperationalQueueRecordViewModel (layout runtime)
  → buildQueueRowOperationalContext        (case-grain adapter)
  → buildChildGrainQueueRowOperationalContext    (child-grain adapter)
  → buildCandidateGrainQueueRowOperationalContext (candidate-grain adapter)
    → QueueRowOperationalContext
      → Queue Row Widgets
        → Evidence builders (pure projections)
```

### QueueRowOperationalContext

The forward-facing contract for queue row widgets.

```typescript
type QueueRowSubjectRef = {
  type: "opportunity" | "opportunity_customer_member" | "placement_candidate";
  grain: OperationalGrain;   // "case" | "child" | "candidate"
  id: string;
  label: string;
  caseRef?: { opportunityId: string };   // set on child + candidate grain
  childRef?: { customerMemberId: string }; // set on candidate grain only
};

type QueueRowOperationalContext = {
  subject: QueueRowSubjectRef;
  truth: Record<string, unknown>;
  signals: QueueRowSignals;
  capabilities: QueueRowCapabilities;
  status: QueueRowStatus;
};
```

### Signals

```typescript
type QueueRowSignals = {
  primaryWork: OperationalWorkItem | null;
  attention: OperationalAttentionSignal;
  tour: OperationalTourSignal | null;           // case-grain only
  placement: QueueRowPlacementSignal | null;     // case + candidate grain
  communications: OperationalCommunicationsSignal | null; // case-grain only
  childStatus: QueueRowChildStatusSignal | null;  // child-grain only
  candidateStatus: QueueRowCandidateStatusSignal | null; // candidate-grain only
};
```

**Signal availability by grain:**

| Signal | case | child | candidate |
|---|---|---|---|
| `primaryWork` | ✅ | ✅ | ✅ |
| `attention` | ✅ | ✅ | ✅ |
| `tour` | ✅ | null | null |
| `placement` | ✅ | null | ✅ |
| `communications` | ✅ | null | null |
| `childStatus` | null | ✅ | null |
| `candidateStatus` | null | null | ✅ |

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

### Communications Signal

Projected from `record["_scheduled_sends_summary"]` (composed sub-field on the queue record).
Case-grain only. Returns null when the summary field is absent.

```typescript
type OperationalCommunicationsSignal = {
  scheduledSendCount: number;
  nextFollowUpAt: string | null;
  hasOutreach: boolean;
  nextScheduledSendId: string | null;
};
```

### Child/Candidate Status Signals

Status belongs to the object that owns it (Doctrine §3 rule S-1).

```typescript
type QueueRowChildStatusSignal = {
  outcomeStatusKey: string | null;   // from record["outcome_status_key"]
  outcomeStatusLabel: string | null; // from record["outcome_status_label"]
};

type QueueRowCandidateStatusSignal = {
  candidateStatus: "active" | "paused" | "withdrawn" | "placed" | null;
  waitSince: string | null;
};
```

---

## Grain Builders

### `buildQueueRowOperationalContext` (case-grain)

Input: `{ record, opportunityId, householdLabel, canMutate?, canOverridePlacement?, entityType? }`

- Sets `grain: "case"`, `type: "opportunity"`
- Populates: `tour`, `communications`, `placement`; `childStatus`/`candidateStatus` null

### `buildChildGrainQueueRowOperationalContext` (child-grain)

Input: `{ ocmId, opportunityId, childLabel, record, canMutate? }`

- Sets `grain: "child"`, `type: "opportunity_customer_member"`, `caseRef` required
- Populates: `childStatus`; `tour`/`communications`/`candidateStatus` null
- `canOverridePlacement` hardcoded `false` — placement override is candidate-grain

### `buildCandidateGrainQueueRowOperationalContext` (candidate-grain)

Input: `{ candidateId, opportunityId, customerMemberId, candidateLabel, record, canOverridePlacement?, canMutate? }`

- Sets `grain: "candidate"`, `type: "placement_candidate"`, `caseRef` + `childRef` required
- Populates: `candidateStatus`, `placement`; `tour`/`communications`/`childStatus` null

---

## Queue Row Builder V1

Operators configure queue row surfaces at `/settings/surfaces → Queue Rows`.

The builder exposes:
- **Column zones**: household, children, status, attention, date/event, actions
- **Placement override affordance** (waitlist rows only): toggles an inline override
  control on each row; operators with placement write permission set a manual tier

### Persistence

Builder persistence is wired as of V1 hardening:

```
Operator toggles zones → clicks Publish
  → POST /api/admin/queue-row-layout/[surfaceId]
      body: { config: QueueRecordLayoutConfigV3, placementOverrideEnabled? }
      → creates draft LayoutDoc with metadata.queue_record_layout = config
      → immediately publishes draft (atomic, no separate publish step)
      → returns published EntityLayoutRecord

Runtime (LayoutRuntimeQueueRowView):
  resolveQueueRecordLayoutConfig(doc)
    → reads doc.metadata.queue_record_layout
    → falls back to defaultLeadQueueLayoutV3() / defaultWaitlistQueueLayoutV3()
```

**Zone → column width mapping** (how zone toggles control column visibility):

| Zone | Column width | Effect when disabled |
|---|---|---|
| `household` | `identity` | Removes primary contact / household name column |
| `children` | `children` | Removes children / candidate list column |
| `status` | `status_band` | Removes lifecycle status chip column |
| `attention` | `next_step` | Removes attention signal + next-step column |
| `date_event` | `date_event` | Removes scheduled date column |
| `actions` | — | Sets `fixedControls.actionsMenu = false` |

**Placement override** (waitlist only): stored in `doc.metadata.queue_context.placement_override_enabled`.
Not in `fixedControls` — no schema change to `QueueRecordFixedControls` required.

**Feature flag**: `POST` requires `isLayoutV2ConfigEnabledServer()`. `GET` falls back to
built-in defaults when flag is off.

---

## Surface Registry

Both queue row surfaces appear in the Surface Library with `status: "published"`:

| Surface | ID | Grain | Entity type | Editor |
|---|---|---|---|---|
| Pipeline Queue Row | `pipeline-queue-row` | `"case"` | `opportunities` | `queue-row-builder` |
| Waitlist Queue Row | `waitlist-queue-row` | `"candidate"` | `placement_candidate` | `queue-row-builder` |

---

## V1 Scope

| Done | Deferred |
|---|---|
| Zone visibility toggle (enable/disable columns) | Per-zone field picker (add/remove fields within a column) |
| Placement override affordance toggle (waitlist) | Zone reordering (drag or up/down) |
| Publish to `entity_layouts` (create + publish draft) | Advanced block configuration (widgets, inline display) |
| Runtime reads published config | Enrollment Offers queue row (child-grain) |
| `GET` loads current published config on open | Placement override write path to `applyPlacementCandidateOverrides` |
| Fallback to built-in defaults when no published layout exists | |
