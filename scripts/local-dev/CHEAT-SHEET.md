# Alloy local-dev cheat sheet

```bash
# Install (once): ~/bin/alloy-dev -> <checkout>/scripts/local-dev
bash scripts/local-dev/install.sh
export PATH="$HOME/bin/alloy-dev:$PATH"   # if needed

# Read-only orientation
alloy-audit
alloy-health
alloy-dev-status
alloy-clean report

# Create / sync / remove
alloy-worktree-create 1 my-initiative cursor
cd ~/Code/alloy-worktrees/wt1-my-initiative/web && npm install
alloy-worktree-sync wt1-my-initiative
alloy-worktree-remove wt1-my-initiative

# Dev servers (ports 3011–3016)
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
```

Ports: canonical `3000` · slots `3011`–`3016`  
Before sync: commit (or local WIP commit). Never rely on auto-stash.  
Push/merge/delete only with explicit human approval.
