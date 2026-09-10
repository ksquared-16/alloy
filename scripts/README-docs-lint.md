# Documentation validation

Run from repository root:

```bash
# Full report (all issues)
node scripts/docs-lint.mjs

# JSON output
node scripts/docs-lint.mjs --json

# CI mode — block new violations in changed governed files
node scripts/docs-lint.mjs --ci --base origin/staging

# Refresh pre-existing debt baseline (maintainers only)
node scripts/docs-lint.mjs --write-baseline
```

Fixture tests:

```bash
cd web && npm run test -- tests/scripts/docsLint.test.ts
```

## Enforcement modes

| Mode | Behavior |
|------|----------|
| **Report** (default) | Prints all violations; exit 0 |
| **CI (`--ci`)** | Blocks on new violations in **changed** files for: broken links in canonical scopes, invalid `docs/` root placement, malformed governed frontmatter, superseded without successor |
| **Baseline** | Pre-existing debt tracked in `scripts/docs-lint-baseline.json`; debt increases are reported but not blocking in Wave 1 |

## Checks

1. Internal Markdown link validation
2. Invalid `docs/` root placement (only `docs/README.md` permitted)
3. Duplicate-basename reporting (canonical trees)
4. Orphan canonical docs (not indexed from `docs/README.md`)
5. Canonical→sprint dependency detection
6. Governed frontmatter parsing (`docs/platform/**`, Wave 1 sprint artifacts)
7. Superseded-document validation
8. Generated-document boundary markers (`docs/schema/`, `docs/api/`)

See `docs/platform/governance/documentation-governance.md` for the metadata contract.

---

## The `docs/platform/planning/` exception (September 2026)

`docs/platform/planning/` is a declared exception to placement rule 3 — see
`docs/platform/governance/documentation-governance.md`. It is scoped in `scripts/docs-lint.mjs`
by `PLANNING_EXCEPTION_PREFIX` / `isPlanningException()`.

**What the exception removes:** the tree is no longer counted as active canonical doctrine for
`orphan-canonical` (it is not doctrine, so absence from `docs/README.md` is correct, not a defect)
or for `duplicate-basename` (which compares active canonical docs). Together these were ~252 of
the repository's reported violations, and they were masking real debt: `orphan-canonical` fell
from 381 to 139, and the 139 that remain are genuinely unreachable canonical docs.

**What the exception adds** — three report-only rules that exist because of it:

| Rule | Fires when |
|------|-----------|
| `canonical-in-planning` | a file under the exception declares `status: canonical` |
| `canonical-planning-dependency` | a `status: canonical` file elsewhere links into the exception |
| `sprint-artifact-in-platform` | a `status: sprint` file sits under `docs/platform/` **outside** the exception — placement rule 3, enforced at last |

**Limit:** all link-based rules read markdown links only. A path in backticks is invisible.
