# Product Contract

The **Product Contract** is the frozen specification of what must be true when work is complete — without implementation sequencing, git mechanics, or worker assignments.

## Sections

The contract separates:

| Section | Source |
|---------|--------|
| A. Human-provided facts | Product Brief intake |
| B. Repository/doctrine findings | `product/audit/*` manifests |
| C. Approved brief decisions | `known_decisions` in brief |
| D. Proposed decisions | Human Decision Queue |
| E. Unknowns | `open_questions` |
| F. Standard policy | Product Runtime V1 rules |

## Artifacts

`product/contract/`:

- `product-contract.md` — human-readable contract
- `product-contract.yaml` — machine summary
- `ux-contract.yaml` — interaction and layout
- `visual-contract.yaml` — visual basis (required for user-visible work)
- `acceptance.yaml` — behavioral acceptance
- `scope.yaml` — in/out of scope
- `test-data-contract.yaml` — verification data needs
- `approval.json` — frozen revision + hash

## Visual basis (exactly one)

| Type | Meaning |
|------|---------|
| `exact_reference` | Screenshots/mockups are source of truth |
| `pattern_reference` | Named existing Alloy surfaces |
| `bounded_exploration` | Kelly-approved exploration within written constraints |

User-visible work **cannot be approved** without a valid visual basis.

Vague adjectives (`premium`, `compact`, `polished`, …) are escalated to the Human Decision Queue unless translated to measurable rules.

## Approval and revisions

`alloy-product-approve` records:

- approver, timestamp, revision number
- Product Contract SHA/hash
- frozen file list

Post-approval changes require `--reason`, revision increment, and reapproval.

## Engineering boundary

Engineering Runtime **consumes** the approved contract via handoff. It must not silently rewrite `product/contract/*` files. Material changes use `engineering/product-change-requests/`.
