# Alloy Engineering Manager V1

Phase 4 local AI Engineering Manager — coordinates initiatives across managed Cursor/Claude workers without replacing Phase 1–3 toolkit primitives.

## Purpose

Remove repetitive engineering coordination:

- Initiative intake from structured briefs (not ChatGPT conversation scraping)
- Repository/doctrine audit with focused documentation manifests
- Proposed specification and task graph before implementation
- Worker packages delivered to managed worktrees (clipboard + app open)
- Structured report ingestion (not conversational "done")
- Review/remediation loops with bounded packages
- Final merge-readiness package (never auto-push/merge)

## Storage

```text
~/.local/state/alloy-dev/initiatives/<initiative-key>/
├── initiative.yaml / initiative.json
├── intake.md
├── state.json
├── decisions.yaml
├── audit/
├── plan/
├── tasks/
├── worker-packages/
├── reports/
├── reviews/
├── remediation/
├── evidence/
└── final/
```

Durable across terminal sessions. Local-only unless you explicitly copy docs into the repo.

## Operator flow

```bash
# 1. Import brief
alloy-initiative-create settings-fields-v2 --from ./brief.yaml
# or: pbpaste | alloy-initiative-import settings-fields-v2

# 2. Audit + plan
alloy-initiative-audit settings-fields-v2
alloy-initiative-plan settings-fields-v2

# 3. Human approval
alloy-initiative-approve settings-fields-v2 --approver Kelly

# 4. Start workers + deliver packages
alloy-initiative-start settings-fields-v2
alloy-worker-open settings-fields-v2 task-001 --with-server
# Paste once into the new worker session

# 5. Ingest worker report
alloy-worker-report settings-fields-v2 task-001

# 6. Review + remediation
alloy-initiative-review settings-fields-v2 --type ui
# (reviewer edits reviews/task-002-review.json)
alloy-initiative-remediate settings-fields-v2

# 7. Final package
alloy-initiative-package settings-fields-v2
alloy-initiative-status settings-fields-v2

# 8. Close after promotion decision
alloy-initiative-close settings-fields-v2 --promotion-recorded
```

## State machine

`draft` → `auditing` → `planning` → `awaiting_plan_approval` → `approved` → `assigning` → `implementing` → `validating` → `reviewing` → (`remediation_required` | `merge_ready`) → `awaiting_promotion_approval` → `closed`

Illegal transitions are rejected. Push/merge is never inferred.

## Knowledge layers (in every worker package)

1. **Constitutional** — canonical platform doctrine (workers may not override)
2. **Initiative-approved** — product/visual/acceptance decisions from approved plan
3. **Worker discretion** — technical choices within A and B

## Cost controls

- Focused checks during implementation; `alloy-validate` for heavy work (serialized lock)
- One integration validation pass on designated candidate
- No push/PR/Vercel preview during local lifecycle
- Validation fingerprints recorded to detect duplicates
- Cost summary in `final/review-package.md`

## Commands

Run `alloy-engineering-help` for the full list. All commands support `--help`.

## Certification

**Run `alloy-engineering-certify` before the first real product initiative.**

```bash
alloy-engineering-certify           # disposable; auto-cleanup on success
alloy-engineering-certify --keep    # retain /tmp/alloy-engineering-cert.* for inspection
alloy-engineering-certify --verbose
```

The certification harness:

- uses a **temporary** `ALLOY_RUNTIME_ROOT` and `ALLOY_INITIATIVE_ROOT` (never touches `~/.local/state/alloy-dev/initiatives/`);
- never modifies production managed-agent metadata;
- does not open Cursor/Claude (launch is intercepted when `ALLOY_ENGINEERING_CERTIFY=1`);
- does not access credentials, auth storage, or browser state;
- does not push, merge, create PRs, or trigger Vercel;
- exercises **production command scripts** via fixture config injection;
- runs happy-path lifecycle + failure-path gates (~48 assertions);
- preserves state on failure; cleans up on success unless `--keep`.

`--keep` prints paths to: initiative brief, audit, specification, approval record, task graph, worker packages, report examples, reviews, remediation, final package, and `certification-manifest.yaml`.

### What certification does not prove

- LLM / planning quality
- Cursor or Claude worker compliance
- Product-specific visual quality
- Real implementation worker behavior

## Related docs

- `INITIATIVE-CONTRACT.md` — intake schema
- `WORKER-PACKAGE.md` — worker delivery contract
- `REVIEW-PIPELINE.md` — review/remediation

## V1 limitations

- No ChatGPT API integration; brief import is explicit YAML/file/clipboard
- Worker delivery is clipboard + app open (one manual paste per worker)
- No daemon, database, or web dashboard
- Task graphs are manager-generated templates (not LLM-planned in V1)
- Promotion still requires human `--promotion-recorded` on close

## Deferred (Phase 4B/4C)

- ChatGPT/OpenAPI initiative import
- Richer task-graph planning from audit context
- Automated review worker assignment
- PR creation helpers (still human-gated)
- Cross-initiative portfolio view
