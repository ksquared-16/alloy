# Business Process Platform V1 — Certification Matrix

**Status: BUSINESS PROCESS PLATFORM V1 COMPLETE.**

Every ordinary Business Process configuration surface loads a draft, saves a draft, survives
reload, validates, publishes, and only then moves runtime. Concurrency is real at both tokens.
Unknown fields survive. The lifecycle guard is enforcing and no ordinary editor trips it.

---

## Matrix

| Capability | Draft | Publication | Runtime after publish | Draft CAS | Publication CAS | Unknown fields | Certified |
|---|---|---|---|---|---|---|---|
| Stage configuration | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | G1–G9 |
| Tracks / transitions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | G2–G7 |
| Outcomes / automation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | G6–G11b |
| Work Views | ✅ | ✅ | ✅ | ✅ **client→server** | ✅ | ✅ | W1–W6, C1–C2 |
| Participation | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | P1–P5 |
| Process removal | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | R1–R4 |
| Published-only execution | — | — | ✅ | — | — | — | G10, G11, G11b |
| Guard enforcement | — | — | — | — | — | — | asserted in P5, R4, C2 |

**Totals:** execution graph 18/18 · Work Views 7/7 · platform closure 12/12. All `rc=0`.

---

## A1 · Participation — P1–P5

```
P1  load http=200  draft_revision=1  status=never_published
P2  save http=200  publication_required=true   draft 1 → 2
    published projection: unchanged
P3  unknown participation field after a save: "survive me"
P4  stale token → http=409 "Someone else changed this configuration while you were editing…"
P5  validate can_publish=true → publish http=200 → revisions 0 → 1, projection changed
```

Participation has **no editing UI** — the card is read-only and its POST is API-driven — so it is
certified through an authenticated session against the real route, paired with SQL. That is the
honest shape of the evidence rather than pretending to drive a form that does not exist.

### A defect this found: `participation_v1` was not lossless

P3 failed on the first run: a field planted inside `participation_v1` came back `(GONE)`. Three
things were wrong, and all three had to be fixed:

1. **`parseParticipationConfigV1` was an allowlist reconstruction** with no Law 7 carrier, so it
   dropped anything it could not name.
2. **`serializeLifecycleBuilderV1` never walked `participation_v1`.** It walks stages and work
   views explicitly because their residue sits one level deeper — participation has exactly the
   same shape and had been missed.
3. **The residue never reached the client at all.** `JSON.stringify` cannot carry the symbol, so
   the GET response omitted it and the client could not send it back. Even a perfect parser would
   have lost it.

The third is the interesting one. The carrier protects server-side object manipulation; it cannot
survive an HTTP round trip. So the save now **merges** the incoming known fields onto the residue
captured from the draft, rather than replacing wholesale:

```ts
participation_v1: withUnknownFields(params.participation, unknownFieldsOf(process.participation_v1) ?? {})
```

A client can only be held responsible for what it was given.

---

## A2 · Process removal — R1–R4

```
R1  removal on the Enrollment department → http=400 "Use Advanced Configuration"
    draft and projection both unchanged
R2  removal on a removable department → http=200 publication_required=true
    draft [keep, doomed] → [keep];  published: still (none)
    unknown field on the SURVIVING process: "survive me"
R3  stale token → http=409;  the process is still there — a conflict never half-applies
R4  validate can_publish=true → publish http=200 → published [keep]
    unknown field in the PUBLISHED projection: "survive me"
    Enrollment untouched;  guard enforcing
```

**R1 is not a workaround, it is the finding.** The Enrollment department refuses process removal
through this route by design, because its configuration is runtime-critical. The certification
proves the refusal is total: nothing moves, in either the draft or the projection. A guard that
mutated before refusing would be worse than no guard.

R2–R4 therefore certify the migrated path on a department where removal is permitted, which is
where the draft/publish behaviour is actually observable.

**Rollback** is not certified: no rollback route is exposed today. `rollback_business_process_to_revision_v1`
exists in the database and is called by the service, but nothing in the API surfaces it. Stated
here rather than claimed.

---

## A3 · Work Views draft CAS, end to end — C1–C2

Driven through **two real browser contexts**, because a server-side CAS test proves the database
refuses while only two real clients prove the *operator is told*.

```
C1  both editors loaded draft_revision=4
    A save http=200   draft 4 → 5
    B save http=409   "Someone else changed this configuration while you were editing…"
    draft labels after both attempts: [All Work, Editor A 4, Follow Up, Tours]
    conflict surfaced to editor B on screen: true
C2  published labels unchanged by the conflict: [All Work, Follow Up, New Leads, Tours]
```

All eight required proofs hold: both load N, A advances to N+1, B is refused with a clear message,
A's change survives, B's does not overwrite it, no silent overwrite occurs, and runtime never
moved. The client now sends `draft_revision` on save and advances it from the save response —
without that second half, an editor would conflict with its own previous write.

---

## A4 · Draft issue counter

The counter reported operating-contract and work-definition findings only, so a stage whose
*execution graph* was broken saved cleanly and was refused at publish. Graph findings now feed the
same delta classifier, which means they are classified the same way: **introduced or worsened by
this edit blocks; inherited is carried as a warning.**

Scoping matters as much as inclusion. Counting every process-wide finding on every stage card
would make each stage report its neighbours' problems until the number was noise. A finding
belongs to a stage when that stage can repair it:

- the finding names the stage, or
- it names a transition **declared on** that stage, or
- its configuration path points into that stage

A finding about another stage's transition is deliberately excluded even when it names this stage
as a destination — the repair happens over there.

Identity is `code` + `path` + `stage_key` + object id. Never message text: a reworded finding is
the same finding, and keying on text would report every copy edit as a new defect.

`web/lib/lifecycle/stageExecutionGraphFindings.ts`, 13 tests.

---

## Tests and typechecks

- Phase A focused suites: **173/173, rc=0** across 18 files
- Narrowed typechecks `stageui` / `stagesave` / `execgraph` / `execgraphui` / `pubcov`: **all rc=0, 0 errors**
- Full repository suite remains at its established baseline of 86 failures, none attributable to
  this work. One nearby failure — `lifecycleBuilderConfigurationCompletion` expecting a
  `qualification` stage — was verified pre-existing by stashing these changes and re-running.

## Known limitations

- **Rollback is uncertified** — no route exposes it (above).
- **Participation has no editing UI**, so its certification is API-level. If an editor is built,
  it should send `draft_revision` from the start; the route already honours it.
- The **full-project typecheck cannot complete on this workstation** (OOM at 137/144 with empty
  output). The narrowed graphs cover the changed surface and are the signal relied on.
