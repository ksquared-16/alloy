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
