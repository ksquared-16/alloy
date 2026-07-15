# Product Runtime V1

Product Runtime is the **local, artifact-driven** workflow that converts Kelly's product direction into an **approved, grounded Product Contract** that Engineering Runtime can execute.

## Operating model

```
Kelly → ChatGPT Product Manager → Product Brief (YAML)
  → Product Runtime → approved Product Contract
  → Engineering Runtime → workers → review package → human promotion
```

**Product Runtime owns WHAT and WHY.**  
**Engineering Runtime owns HOW** within the approved contract.

## V1 honesty

Product Runtime is **not**:

- an autonomous product strategist
- a ChatGPT conversation scraper
- an embedded LLM in shell scripts
- a daemon, database, or customer-facing Alloy module

**Manual in V1:**

1. Product discussion with ChatGPT
2. One Product Brief copy/import (`alloy-product-create <key> --clipboard`)
3. Product Contract approval (`alloy-product-approve`)
4. Occasional product decisions (`alloy-product-decide`)
5. Final promotion approval (push/merge) by Kelly

## Commands

| Command | Purpose |
|---------|---------|
| `alloy-product-create` | Import brief (clipboard/file) |
| `alloy-product-import` | Import brief from stdin |
| `alloy-product-audit` | Ground references against repo doctrine |
| `alloy-product-contract` | Generate proposed Product Contract |
| `alloy-product-decisions` | Show Human Decision Queue |
| `alloy-product-decide` | Record a product decision |
| `alloy-product-approve` | Freeze approved contract revision |
| `alloy-product-package` | Kelly review package |
| `alloy-product-handoff` | Bridge to Engineering Runtime |
| `alloy-product-certify` | Isolated certification harness |

## Storage

`~/.local/state/alloy-dev/initiatives/<key>/product/`

Engineering artifacts remain at the initiative root (existing Engineering V1 layout).

## State machine

`draft` → `auditing` → `contracting` → `awaiting_decisions` | `awaiting_product_approval` → `approved` → `packaged` → `handed_off` → `closed`

Illegal transitions fail closed.

## Security

- Imported briefs are **untrusted data** — never executed
- No credentials, tokens, or conversation history in artifacts
- Product Runtime **never starts workers, servers, pushes, or merges**

See also: `PRODUCT-CONTRACT.md`, `HUMAN-DECISION-QUEUE.md`, `PRODUCT-ENGINEERING-HANDOFF.md`
