# Large artifacts excluded from git

GitHub rejects files over 100 MB. These artifacts are preserved outside git:

| File | Size | Preserved at |
|------|------|--------------|
| `staging-9d565f2.bundle` | ~105 MB | `~/Alloy-safety-backups/20260615-112312/untracked-files.tar.gz` |

Do not add `staging-9d565f2.bundle` to any remote branch unless using Git LFS.
