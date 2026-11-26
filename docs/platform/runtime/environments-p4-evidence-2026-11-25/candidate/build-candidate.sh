#!/bin/bash
# Build the P4 staging->main integration candidate without a checkout.
# Tree = origin/staging's tree, except .github/workflows/vacilando-tier2.yml, which keeps main's retired copy.
# Parents = (staging, main), so main can fast-forward to it. Identity and dates are pinned, so the SHA is reproducible.
set -euo pipefail
STAGING=${1:-8321949771f7fb6b2f04de6feb1fdd6ccb8e1484}
MAIN=${2:-bbfbec76d7795cc3392b0c61e1c8ce829adaf9d2}
STAGING=$(git rev-parse --verify "$STAGING^{commit}"); MAIN=$(git rev-parse --verify "$MAIN^{commit}")
IDX=$(mktemp -t p4-candidate-index); rm -f "$IDX"
export GIT_INDEX_FILE="$IDX"
git read-tree "$STAGING"
P=.github/workflows/vacilando-tier2.yml
git update-index --cacheinfo "$(git ls-tree "$MAIN" -- "$P" | awk '{print $1","$3}'),$P"
TREE=$(git write-tree); rm -f "$IDX"; unset GIT_INDEX_FILE
export GIT_AUTHOR_NAME=Kelly GIT_AUTHOR_EMAIL=kelly@kurzmancapital.com GIT_COMMITTER_NAME=Kelly GIT_COMMITTER_EMAIL=kelly@kurzmancapital.com
export GIT_AUTHOR_DATE="2026-11-25T15:00:00-08:00" GIT_COMMITTER_DATE="2026-11-25T15:00:00-08:00"
git commit-tree "$TREE" -p "$STAGING" -p "$MAIN" <<MSG
Integrate staging into main (ALY-14 P4 candidate)

Reconciles the seven commits on main that staging lacks. Tree is staging's,
except .github/workflows/vacilando-tier2.yml, which keeps main's retired copy.

- 4fc021df1, ed168d83b (Merge branch 'staging', 2026-04-06): no net content.
  Every path they touched already matches staging.
- 753a99764 (Queue Row Builder V2 + Financial Config centered expansion):
  same patch-id as staging's f5d388659. Staging then evolved all six files
  further and deleted BillingPreviewCard.tsx in 704ca302b. Take staging.
- 80ff5bf59 (Merge PR #56): carries only 753a99764. Take staging.
- 7204dff44, 4e920e4f0, bbfbec76d (repo-ops metadata,
  vacilando-tier2.yml): main's copy is the retired one, with the nightly
  schedule removed. GitHub runs schedules only from the default branch, so
  staging's copy would re-arm it. Keep main's.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
MSG
