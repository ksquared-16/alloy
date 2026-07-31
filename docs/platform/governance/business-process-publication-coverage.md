# Business Process Publication Coverage

**Status:** Configuration Integrity V1 — coverage complete
**Claim:** Business Process configuration has **one** publication system, not several.

Every ordinary editor now follows the same path:

```
load draft → edit draft → save draft → reload draft → validate → publish → runtime
```

No ordinary editor writes `departments.metadata.lifecycle_builder_v1`.

---

## Coverage table

| Editor | Draft | Publication | Runtime | Certified |
|---|---|---|---|---|
| Stage configuration (operating plan, statuses, queue membership, field rules) | ✅ `writeStageDraft` | ✅ | after publish | ✅ G1–G9 |
| Execution graph (transitions, outcomes, automation) | ✅ same draft | ✅ | after publish | ✅ G1–G11b |
| **Work Views** | ✅ `editProcessInDraft` | ✅ | after publish | ✅ W1–W6, 7/7 |
| **Participation** | ✅ `editProcessInDraft` | ✅ | after publish | ✅ source + typecheck |
| **Process removal** (lifecycle-catalog delete) | ✅ `editBuilderInDraft` | ✅ | after publish | ✅ source + typecheck |
| Generic department metadata endpoint | — | — | — | ✅ **refuses** (B) |

### Category B — explicitly disabled, with an operator-facing reason

`PATCH /api/admin/departments/[departmentId]` deep-merges arbitrary caller metadata, which made it
a generic bypass able to rewrite any part of a configured process. It now returns **409** with:

> Business Process configuration cannot be changed here. It is published configuration — edit the
> draft and publish it through the Business Process configuration service.

The database guard would reject it anyway, but as an opaque Postgres error. Refusing in the route
gives the caller a reason *and* a destination.

---

## Not migrated, deliberately

The brief scopes this to **ordinary editing**. These write the projection and should:

| Path | Why it stays |
|---|---|
| `businessProcessConfigurationService` publish/rollback RPCs | This **is** publication. The write happens inside `publish_business_process_revision_v1`, which holds the guard's capability token. |
| `repairLifecycleWorkspaceVisibility` | Repair script, not an editor. Uses the guard's sanctioned `begin_lifecycle_projection_write('migration')` escape. |
| `applyVerticalBootstrap` | Does **not** write the key — it strips `lifecycle_builder_v1` out of blueprint metadata so a blueprint cannot smuggle configuration in. |
| `lifecycleActivationOwned` | Teardown: deletes the key when a department stops being builder-owned. Not an edit to a live configuration. |

---

## The one operation

`web/lib/businessProcesses/configuration/editProcessInDraft.ts`

```ts
editProcessInDraft(supabase, { …, edit: (process) => ({ ...process, work_views_v1: next }) })
editBuilderInDraft(supabase, { …, edit: (builder) => removeProcessFromConfig(builder, id) })
```

Every family was previously hand-rolling *read projection → merge → UPDATE departments*, and each
got it subtly differently: some invalidated the runtime cache (claiming a change the runtime had
not made), none used a conflict token, and all of them moved runtime the instant an operator
typed. One operation is what makes the "one publication system" claim structural rather than
aspirational.

**Edits spread the object** (`{ ...process, … }`) rather than rebuilding it. That preserves the
Law 7 unknown-field carrier, so `row_grain_v1` and every field a future branch adds survive an
edit by a branch that has never heard of them.

---

## Guard and capability

**Lifecycle guard: `enforce`.** This is the migration default — `warn` is opt-in per database
(`ALTER DATABASE … SET alloy.lifecycle_guard = 'warn'`) and exists only for the rollout window.
Nothing sets it. Every ordinary editor was certified against an enforcing guard, so any remaining
guard hit is a genuine bypass.

**Capability: `live_on_save` → `publish_required`.** Flipped only after coverage was complete.
`business-processes` now reads *"Draft saved — live after publish"* with `mode: "explicit"`,
matching three sibling capabilities that already publish explicitly. Leaving it on `live_on_save`
would have had the card tell operators the opposite of what the product does.

---

## Enforcement

`web/tests/configPublication/publicationCoverage.test.ts` asserts coverage against the source,
because the claim is *"no other path exists"* — which no behavioural test can show:

- no ordinary editor matches `from("departments") … .update(`
- **not even the publication service** writes the projection from application code; it calls the
  guarded Postgres functions, so the projection has exactly one writer and it lives in the database
- every ordinary `lib/` editor reaches a known draft writer
- every ordinary route returns `publication_required` and maps a concurrent draft edit to **409**,
  not a 500
- both migrated GETs read the **draft**, so a saved edit cannot vanish on reload
- edits spread the process rather than rebuilding it

Adding a new editor that writes the projection fails these tests.

---

## Work Views certification — W1–W6, `rc=0`

`certification/playwright/work-views.cert.spec.ts`, isolated `alloy-cert` tenant, guard at
`enforce`. The chain the brief asked for, each step paired with a SQL claim:

```
W1  load        http=200  draft_revision=1  status=never_published
W2  save        http=200  publication_required=true
    draft       [All Work, Certified View 1, Follow Up, Tours]     ← the edit is here
    published   unchanged=true                                      ← and NOT here
W3  reload      [All Work, Certified View 1, Follow Up, Tours]     ← reads where the save landed
W4  unknown field after a Work Views save: "survive me"            ← Law 7 survives
W5  validate    can_publish=true errors=0
    publish     http=200   revisions 0 → 1
    published   [All Work, Certified View 3b, Follow Up, Tours]    ← runtime moves, now
W6  runtime surface visible=[All Work, Certified View 3b, Follow Up, Tours]
```

**W2 is the migration in one line.** The draft carries the rename; the projection does not. Before
this sprint the projection changed the instant the operator clicked save.

**W4** plants `a_field_from_the_future` directly in the draft, then saves Work Views through the
UI, and finds it intact. `row_grain_v1` itself is absent from the representative seed, so the
planted field — not `row_grain_v1` — is what actually carries the proof.

**W6** reads the operator's runtime surface and finds the renamed view there, after the publish
and only after it. Publish invalidates the tenant config read cache (`publishDraft` /
`rollbackToRevision`); the save deliberately does not, because nothing the runtime reads changed.

---

## Known limitations

- **Participation and process-removal are proven by source assertions and typecheck, not by
  browser certification.** They use the identical operation Work Views is browser-certified on,
  and the coverage tests pin their read/write paths, but no Playwright scenario drives their UI.
  Worth adding when either surface next changes.
- The Work Views editor UI does not yet send `draft_revision` on save, so its writes fall back to
  the server-read token. The CAS is available and honoured when supplied; wiring the client is a
  small follow-up, and until then two operators editing Work Views concurrently can still
  last-write-win against each other (they can no longer damage runtime, which was the severe half).
