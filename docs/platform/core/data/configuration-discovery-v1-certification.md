# Configuration Discovery V1 — certification record

**Status: CERTIFIED** · certified 2026-07-30 · branch `agent/claude/4-phase7-slice3-participant-runtime`

Scope frozen at certification: finish certification, fix defects it finds, document implemented
behaviour, close out. No new capabilities.

Canonical architecture: [`relationship-model.md`](./relationship-model.md).

---

## What was certified

The full chain, end to end, against a real running stack — not by inspection:

```
Relationship Definitions  →  Collection Projection  →  Forms  →  public submission
      →  Processing proposals  →  approval  →  guarded canonical execution  →  normalized read
```

The governing rule throughout: **a collection is ONE projection of the canonical Relationship
Model.** No layer in the chain keeps a per-role allowlist, and adding a role (Physician) is one
definition row with no provider, Forms, Discovery, Processing or execution change.

## Environment

Isolated local certification stack only — no staging or production writes, and no staging
service-role secret in the worktree.

| Component | Value |
|---|---|
| Stack | `alloy-cert` (api 54421, db 54422, studio 54423, mail 54424) |
| App | `CERT_APP_PORT=3018 certification/alloy-certify serve` |
| Fixture | `certification/fixtures/configuration-discovery-v1-fixture.sql` (namespace `cdc10000-`) |
| Teardown | `certification/fixtures/configuration-discovery-v1-teardown.sql` |
| Journey | `web/playwright/tests/configuration-discovery-proving-journey.spec.ts` |

The fixture deliberately seeds two ACTIVE sibling children (sibling isolation needs a real sibling),
an `authorized_pickup` role key (the seeded tenant ships none, and its absence would have resolved to
a null role and silently written nothing — a false pass), and one Person who holds BOTH guardian and
authorized-pickup so multi-role presentation is provable. The emergency contact is deliberately NOT
pre-created: its absence is what proves create-vs-link.

## Result

**16/16 journey tests pass, twice consecutively from a clean fixture.**

| # | Certifies |
|---|---|
| 1–5 | import → detect → decisions → apply (idempotent) → save → generate → publish → reopen |
| 6–7 | the published form carries three relationship COLLECTIONS; bindings and lineage survive publish and reopen |
| 8 | real collection responses through the supported public form path |
| 9 | Processing proposals carry SERVER-DERIVED relationship intent |
| 10 | identity resolution and per-proposal approval through the supported Processing path |
| 11 | commit through the REAL guarded route |
| 12–14 | retry is idempotent, no duplicates, sibling untouched, a different child is a distinct commit |
| 15 | omission is non-destructive |
| 16 | operational read shows every role without exposing storage |
| 17 | live security matrix |

### Live security matrix (test 17)

Nine spoofs against the real commit route, each refused with a specific code — and every one a
deliberate refusal (4xx), never a crash:

| Attempt | Result |
|---|---|
| unauthenticated caller | 401 Unauthorized |
| unknown proposal id | 400 decision proposal_id mismatch |
| proposal committed under a DIFFERENT case | 404 not found |
| client asserts a different ROLE | 400 `client_role_not_authoritative` |
| client asserts a different COMMAND | 400 `client_command_not_authoritative` |
| unsupported scope | 400 `scope_not_supported` |
| anchor child outside the resolved household | 403 `anchor_not_found` |
| stale resolution revision | 409 `resolution_stale` |
| decision is not approve | 403 `proposal_not_approved` |

The matrix also captures canonical relationship state for both the anchor child and the sibling
before and after the whole run and asserts they are unchanged. **A request that is refused but still
writes is a worse defect than one that is accepted, and status codes alone cannot detect it.**

### Operational read (test 16)

One normalized projection, one row per canonical Person, storage invisible:

| Person | Roles | Underlying store |
|---|---|---|
| emergency contact (respondent-added) | `emergency_contact` | canonical |
| Dana | `guardian` | legacy-sourced |
| Sam | `authorized_pickup`, `guardian` | **both** |
| Sibling B | `authorized_pickup` | correct child scope |

Sam appears ONCE with BOTH roles across two persistence destinations. Provenance
(`metadata.legacy_source`, `metadata.merged_sources`) is retained for developer diagnostics but is
never a product-level field a consumer could branch on.

### Omission (test 15)

Proven with **specific identities, not counts**. Before and after a submission that omits the
guardians and the pickup, the normalized read is byte-identical across all four role assignments and
all three Persons. An earlier version of this proof compared two empty snapshots and passed only
because the read was broken — which is exactly why counts are not evidence.

## Defects found BY certification, and fixed

Every one of these was invisible to unit tests and to inspection.

**1 · Person hydration selected a non-existent column, and discarded the error.**
`loadPersonsMap` selected `persons.display_name`; PostgREST rejected the whole query (42703) and the
error was dropped, so the map came back empty and the resolver reported `missing_person` — every
child in every organization appeared to have no family. Fixed by selecting only real columns and
throwing loudly with table/op/code/count. *A schema fault must never masquerade as "this child has no
family."*

**2 · One unresolvable row erased a child's whole family.** Resolution was all-or-nothing. Now
row-level: the bad row is skipped with a structured warning and status `resolved_with_warnings`;
all-skipped still reports why rather than returning a bare empty. A cross-organization Person stays
excluded and reported, never partially returned.

**3 · The certification was not repeatable.** Found only by running it twice. Teardown deleted persons
but never deleted `contacts`; because `contacts.person_id` is SET NULL on person delete, the orphaned
row kept its address and `contacts_email_unique` rejected the next run's guardian and pickup links.
The journey had been passing solely because earlier runs left those rows behind. Teardown now collects
app-created records by traversal from the fixture household and deletes contacts before persons.

**4 · The teardown marker could not fail.** It counted customers/children/persons and reported 0 while
exactly the rows that broke the next run were still present. It now counts contacts, relationships and
member-contacts too.

**5 · Execution failures were undiagnosable.** Defect 3 surfaced only as "Relationship execution
failed." The adapter reports failures as a nested shape (`error.operatorMessage`,
`diagnostics[].message`) and the commit read only top-level strings. Now reads the nested shape.

**6 · Public lead-capture intake was broken by the projection.** Suppressed flat guardian fields meant
no Processing case opened. Closed by `resolveGuardianFromCollectionEnvelope.ts`.

Earlier in the sprint, certification also caught: only `parents` being bindable in Forms (emergency
and pickup were unbindable); prefill hardcoding `role: "parents"`; a projection that would have
stripped signature and classroom-copy sections; and a `Object.fromEntries` collapse that masked the
first guardian.

## Regression coverage

- `web/tests/fields/personChildRelationship/personChildRelationshipReadRegression.test.ts` — 18 tests
  locking defects 1 and 2 plus merge semantics. Asserts identities, never counts.
- 66/66 across the relationship and commit suites.
- Broker production typecheck `rc=0`.

## Deliberate V1 boundaries

Recorded so they are decisions, not oversights:

- **Guardian storage stays in `customer_member_contacts`.** Certified as an intentional compatibility
  boundary. `persists_to` is the seam that makes a later convergence a config change plus a backfill.
  A storage migration is a separate mission with its own dual-read and product approval.
- **Omission never deletes.** No deletion workflow exists in V1.
- **The legacy read projection recognises the legacy compat role set.** Configured roles persist to
  `person_child_relationships`, so this is not a limitation in practice.
- **`POST /api/admin/relationship-actions/execute` still reaches the executor directly.** The spoofing
  half is closed; the structural seam is deferred.
- **Conformance ledger gaps 7 and 9–12 remain open** — see `relationship-model.md`. Gap 9 (a second
  hand-authored registry in the Focus Panel) is the one to watch.

## Reproducing

```bash
CERT_APP_PORT=3018 certification/alloy-certify serve
```

```bash
psql "$CERT_DB" -f certification/fixtures/configuration-discovery-v1-teardown.sql && psql "$CERT_DB" -f certification/fixtures/configuration-discovery-v1-fixture.sql
```

```bash
cd web && PLAYWRIGHT_BASE_URL=http://127.0.0.1:3018 npx playwright test playwright/tests/configuration-discovery-proving-journey.spec.ts
```

Teardown must report `0` across all six residue counts. Two consecutive runs must both pass 16/16 —
a single passing run does not demonstrate repeatability, as defect 3 showed.
