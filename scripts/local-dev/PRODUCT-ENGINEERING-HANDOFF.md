# Product → Engineering Handoff

`alloy-product-handoff <key>` is the **only normal bridge** from Product Runtime into Engineering Runtime.

## Prerequisites

- Product Contract **approved**
- Contract hash valid (matches `approval.json`)
- **Zero** blocking product decisions
- Product state: `approved` or `packaged`

## Artifacts

`product/final/`:

- `engineering-handoff.yaml` — machine-readable handoff
- `handoff-manifest.json` — same content as JSON
- `product-review-package.md` — Kelly review (from `alloy-product-package`)

## Handoff contents

Includes (never secrets):

- initiative identity, product revision, contract hash
- operator/business outcomes, scope, constraints
- immutable product decisions
- UX/visual contract references
- acceptance, verification targets, test-data requirements
- engineering discretion and forbidden interpretations
- reference manifest paths, staging baseline SHA

## Engineering initialization

Handoff creates or updates:

- `initiative.yaml` / `initiative.json` (engineering intake derived from brief + handoff)
- `state.json` with `product_contract_hash`
- `product-handoff.json`

Then Engineering continues:

```bash
alloy-initiative-audit <key>
alloy-initiative-plan <key>
alloy-initiative-approve <key> --approver Kelly
alloy-initiative-start <key>
```

Alternative: `alloy-initiative-create <key> --from-handoff` if engineering was not auto-created.

## Guards

- `alloy-initiative-start` refuses if Product Runtime exists but is not `handed_off`
- Worker packages include **Product truth** section from `product-handoff.json`
- Final Engineering review compares delivery against approved Product Contract

## Product change requests

When implementation discovers a material product gap:

`engineering/product-change-requests/<id>.yaml`

Material changes return work to Product Runtime for revision and reapproval.
