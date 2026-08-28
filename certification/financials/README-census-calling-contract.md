# How to actually get a census executed

Two runs were spent on a census that "did not work". Both failures were caller-side, and
neither was visible from the request result — `vac governed-action` returned a request id
each time, so the request looked accepted and simply never produced anything.

The failure is provable locally against the host's own validator:

| Request | Result |
|---|---|
| no `artifact_refs`, `databaseTarget: "staging"` | `query_hash_mismatch` |
| target corrected only | `query_hash_mismatch` |
| artifact path corrected only | `wrong_database_target` |
| both corrected | **OK** |

## 1 — The query path rides in `artifact_refs`, NOT in `inputs`

`validateAgainstRegistry` builds the validated inputs as:

```js
queryArtifactPath: artifactPathFrom(artifactRefs)
```

It **overrides** whatever `inputs.queryArtifactPath` you sent. And `artifactPathFrom`
falls back to a default when the refs are empty:

```js
return first ? String(first) : Q15_CENSUS_ARTIFACT;
```

`Q15_CENSUS_ARTIFACT` is an unrelated Access & Identity census JSON. So a request that
names its query only in `inputs` is silently validated against **a different file**, and
your `expectedQueryHash` fails against contents you never named. The error says
`query_hash_mismatch`, which reads like "my SQL changed" rather than "you censused the
wrong file".

## 2 — `databaseTarget` must be `alloy_deployed_primary`

`"staging"` is rejected with `wrong_database_target`. There is one deployed target.

## The shape that works

```jsonc
{
  "action_key": "database.read_census",
  "artifact_refs": ["certification/financials/billable-source-customer-census.sql"],
  "reason_worker_cannot_execute": "...",   // required, or the request is refused outright
  "reason": "...",
  "inputs": {
    "expectedQueryHash": "<sha256 of the .sql file>",
    "databaseTarget": "alloy_deployed_primary",
    "worktreePath": "/absolute/path/to/this/worktree"
  }
}
```

## Two things that are NOT the problem

**An unpushed branch is fine.** `resolveArtifactRoot` resolves the artifact from the
worktree (`worktreePath` → `walkToRepoRoot`), then `existsSync` on the absolute path. The
file does not need to be pushed or promoted. That was the first hypothesis here and it was
wrong.

**A `.sql` artifact is fine.** JSON artifacts are supported (`combined_query` / `sql` /
`query`, with an embedded `query_hash`), but a plain `.sql` file is hashed whole and its
hash is the file's own sha256 — exactly what `shasum -a 256` prints.

## Verify before requesting

```bash
node --input-type=module -e "
import { getActionDefinition } from '<toolkit>/lib/vacilando/trusted-host-action-registry.mjs';
console.log(getActionDefinition('database.read_census').validateInputs({
  queryArtifactPath: '<path>', expectedQueryHash: '<hash>',
  databaseTarget: 'alloy_deployed_primary', worktreePath: '<worktree>',
}));"
```

`{ ok: true }` before you request costs seconds. A silently mis-validated request costs a run.
