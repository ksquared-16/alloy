# Alloy local-dev cheat sheet

```bash
# Install (once): ~/bin/alloy-dev -> <checkout>/scripts/local-dev
bash scripts/local-dev/install.sh
export PATH="$HOME/bin/alloy-dev:$PATH"   # if needed
source ~/bin/alloy-dev/shell-aliases.sh   # awt / devup / astatus / ahealth

# Read-only orientation
alloy-audit
alloy-health
alloy-ai-health
alloy-agent-status
alloy-clean report

# Phase 2 managed agent lifecycle
alloy-agent-create my-initiative              # first free slot + default AI for that slot
alloy-agent-create my-initiative claude
alloy-agent-create queue-perf --slot 3        # permanent Performance slot
alloy-agent-open 3
alloy-agent-open 3 --with-server              # never duplicates
alloy-agent-instructions 3 --copy
alloy-agent-status
alloy-agent-close 3                           # stops server; never removes worktree

# Phase 3 verification bootstrap
alloy-agent-prepare 3                         # safe web/.env.local.agent (explicit allowlist)
alloy-dev-start <worktree>                    # required — agent-safe + trusted server injection (not npm run dev)
alloy-agent-login 3                           # manual /login → storage state
alloy-agent-ready 3                           # READY / NOT READY (toolkit-owned + two-tier env)
alloy-agent-verify 3 authenticated-home
alloy-agent-verify 3 route /workspace
alloy-agent-verify 3 focused-spec playwright/tests/smoke-field-registry.spec.ts
alloy-agent-context 3 --copy
alloy-agent-evidence 3
alloy-agent-browser-stop 3                      # slot-owned browser only

# After alloy-dev-start: Next.js may dirty web/next-env.d.ts — restore before READY:
#   git restore web/next-env.d.ts

# Shell shortcuts
awt 3                                         # cd slot 3 worktree
devup                                         # start owned localhost server

# Phase 1 primitives (still available)
alloy-worktree-create 1 my-initiative cursor
cd /Users/Kelly/Code/alloy-worktrees/wt1-my-initiative/web && npm install
# required per worktree — browser helpers use this worktree-local Playwright only
alloy-worktree-sync wt1-my-initiative
alloy-worktree-remove wt1-my-initiative

alloy-dev-start wt1-my-initiative
alloy-dev-stop wt1-my-initiative
# URL: http://localhost:3011

# Focused checks (no global lock)
cd web && npx vitest run path/to/file.test.ts

# Heavy checks (serialized)
alloy-validate wt1-my-initiative typecheck
alloy-validate wt1-my-initiative test
alloy-validate wt1-my-initiative build
alloy-validate wt1-my-initiative playwright
alloy-validate wt1-my-initiative imports

# Phase 4 Engineering Manager (initiative lifecycle)
alloy-engineering-certify                    # run before first real initiative
alloy-engineering-certify --keep             # inspect certification artifacts
alloy-engineering-help
alloy-initiative-create settings-fields-v2 --from ./brief.yaml
alloy-initiative-audit settings-fields-v2
alloy-initiative-plan settings-fields-v2
alloy-initiative-approve settings-fields-v2 --approver Kelly
alloy-initiative-start settings-fields-v2
alloy-worker-open settings-fields-v2 task-001 --with-server   # paste package once
alloy-worker-report settings-fields-v2 task-001
alloy-initiative-review settings-fields-v2 --type ui
alloy-initiative-remediate settings-fields-v2
alloy-initiative-package settings-fields-v2
alloy-initiative-status --all
alloy-initiative-close settings-fields-v2 --promotion-recorded
```

Ports: canonical `3000` · slots `3011`–`3016`  
Permanent roles: 1 Product · 2 Architecture · 3 Performance · 4 UI/UX · 5 Refactor · 6 Experimental  
Before sync: commit (or local WIP commit). Never rely on auto-stash.  
Push/merge/delete only with explicit human approval.
