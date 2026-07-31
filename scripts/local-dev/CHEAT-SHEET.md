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

# Autonomous Inspection Surface — genuinely read-only, safe under Bash(alloy-ro *)
# See AUTONOMOUS-INSPECTION-SURFACE.md
alloy-ro root
alloy-ro worker-status
alloy-ro agent-status 3 --json
alloy-ro dev-status
alloy-ro agent-evidence 3
alloy-ro runtime-paths
alloy-ro capabilities --json

# Runtime Registry & Inspection V1 — observe only (Supabase/Docker runtimes)
# See RUNTIME-REGISTRY-INSPECTION.md
alloy-ro runtime-list
alloy-ro runtime-discover
alloy-ro runtime-capacity
alloy-ro runtime-status <id|namespace>
alloy-ro runtime-containers <id|namespace>   # redacted: no command/env/secrets
# explicit registration (mutating; outside alloy-ro; never infers ownership):
alloy-runtime-register <namespace> --owner <mission-key> --class dedicated-disposable

# Runtime Intent & Admission Contract V1 (R2) — DECLARE only (admission is NOT provisioning)
# See RUNTIME-INTENT-ADMISSION.md
alloy-ro runtime-policy                        # posture->isolation mapping + admission policy
alloy-ro runtime-admission <slot|name>         # live admission decision (ephemeral; declares, never provisions)
alloy-ro runtime-intent    <slot|name>         # inspect a recorded intent (or none) + staleness
alloy-ro runtime-explain   <slot|name>         # posture resolution vs admission vs actual runtime state
# record an immutable intent (mutating; outside alloy-ro; identity-checked; no slot-only targeting):
alloy-runtime-intent <worktree> --mission <key> [--coordinate --coordination-reason "..."] [--supersede]

# Runtime Actuation V1 (R3) — ACTUATE (realizes an admitted intent; a zero provider exit is NOT success)
# See RUNTIME-ACTUATION.md
alloy-ro runtime-reservations                  # capacity reservations (control-plane claims; read-only)
alloy-ro runtime-executions [<execution-id>]   # execution lifecycle records (read-only)
alloy-ro runtime-actuation-capacity            # reservation-aware capacity overlay (read-only)
# realize an admitted intent (mutating; outside alloy-ro; identity-checked; no slot-only targeting):
alloy-runtime-actuate <worktree> --operation <provision|attach|detach|retire|reconcile> --mission <key> \
                      [--adapter supabase|fixture] [--reservation-ttl <s>]

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

# Managed Sprint Operations V1 (normal daily lifecycle)
# Canonical doctrine: docs/platform/governance/managed-sprint-operations.md
alloy-sprint-start my-sprint --provider cursor --slot auto
alloy-sprint-start my-sprint --provider claude --slot 3 --with-server
alloy-worker-status                           # six-slot table
alloy-worker-pause 3                          # overnight
alloy-worker-resume 3                         # morning
alloy-worker-pause --all
alloy-worker-resume --all
alloy-worker-doctor --all                     # read-only
alloy-worker-doctor 3 --recover               # clear stale PIDs only
alloy-docker-doctor                           # Docker host health (shared)
alloy-docker-doctor --recover                 # quit + relaunch Docker Desktop
alloy-docker-doctor --recover --force         # force-kill when wedged
alloy-db-reset --recover-docker               # local supabase db reset + 502 retries
alloy-sprint-finish 3                         # free slot; never delete/push/merge/PR

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

# Phase 4 Product Runtime → Engineering Runtime
alloy-product-certify                          # run before first real product initiative
alloy-product-certify --keep
alloy-runtime-paths                            # resolved runtime path names (no secrets)
alloy-cert-leak-report                         # report leaked cert metadata only
# alloy-cert-leak-clean --confirm              # interactive cleanup of leaked cert metadata
alloy-product-help
# ChatGPT → YAML brief → clipboard:
alloy-product-create my-feature --clipboard
alloy-product-audit my-feature
alloy-product-contract my-feature
alloy-product-decisions my-feature
alloy-product-decide my-feature decision-001 --choice "..." --decided-by Kelly --reason "..."
alloy-product-approve my-feature --approver Kelly
alloy-product-package my-feature
alloy-product-handoff my-feature               # creates Engineering intake
alloy-initiative-audit my-feature
alloy-initiative-plan my-feature
alloy-initiative-approve my-feature --approver Kelly
alloy-initiative-start my-feature

# Phase 4 Engineering Runtime (engineering-only path)
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
alloy-initiative-review settings-fields-v2 --mode advisory --type ui
alloy-initiative-review settings-fields-v2 --mode final --type integration
alloy-initiative-remediate settings-fields-v2
alloy-initiative-package settings-fields-v2
alloy-initiative-status --all
alloy-initiative-close settings-fields-v2 --promotion-recorded
```

Ports: canonical `3000` · slots `3011`–`3016`  
Permanent roles: 1 Product · 2 Architecture · 3 Performance · 4 UI/UX · 5 Refactor · 6 Experimental  
Before sync: commit (or local WIP commit). Never rely on auto-stash.  
Push/merge/delete only with explicit human approval.
