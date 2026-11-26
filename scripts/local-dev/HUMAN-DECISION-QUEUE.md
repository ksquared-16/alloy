# Human Decision Queue

The Human Decision Queue holds **durable product decisions** that materially affect what is being built or approved.

## Decision schema

Each decision (`product/decisions/decision-NNN.yaml`):

- `decision_id`, `question`, `category`, `why_it_matters`
- `options`, `recommendation`, `affected_contract_sections`
- `blocking: true | false`, `work_that_can_continue`
- `status: open | decided | deferred | superseded`
- `decision`, `decided_by`, `decided_at`, `reason` (when decided)

## Categories

`product_direction`, `scope`, `visual_direction`, `interaction`, `content`, `data_behavior`, `permissions`, `security`, `architecture_boundary`, `release`

## Commands

```bash
alloy-product-decisions <key>
alloy-product-decide <key> decision-001 \
  --choice persistent-details-panel \
  --decided-by Kelly \
  --reason "Preserves list context"
```

## Blocking behavior

- **Blocking** decisions prevent Product Contract approval
- **Non-blocking** decisions may proceed with documented assumptions
- `alloy-product-decide` regenerates affected contract sections

## What does not belong here

Implementation trivia (hook naming, test file layout) stays in Engineering discretion — not the Human Decision Queue.

## Provenance

Decisions may originate from:

- explicit `open_questions` in the Product Brief
- vague visual language detection
- audit conflicts (legacy vs canonical surfaces)

Approved decisions in the handoff are **immutable** for the product revision.
