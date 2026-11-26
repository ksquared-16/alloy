# The external Financials human QA — which surface it is, and what "no login" meant

Run `erun_b4fd0fb41c69aeb5`. Discovery before deletion. Nothing has been deleted.

## 1. Identity: unambiguous

The Director's external Financials human QA is **`/dev/core-financials-qa`**.

| | |
|---|---|
| Created | `333e11b09`, 2026-09-14 — *"feat(qa): the Director QA walkthrough, beside the product instead of inside it"* |
| Superseded | `cd5e8ca54`, same day — *"a Director QA harness that observes Financials and never participates in it"*, which lived at `app/adminV2/system/qa/core-financials/` |
| Files | `app/dev/core-financials-qa/page.tsx`, `CoreFinancialsQaReader.tsx` |
| Model it follows | `/dev/real-enrollment-qa`, which its own header names |

All three identity criteria hold, and they hold only for this surface:

- **Outside the authenticated operator shell.** No sidebar, no BOS, its own tab. Its header says so: *"The first version of this rendered inside the authenticated Alloy operator shell, complete with sidebar and BOS. That is the wrong room for human acceptance."*
- **A scenario-by-scenario human walkthrough.** One scenario at a time, Navigate / Do this / Expect / Fail symptoms.
- **Notes.** `qa-observation` ("What did you actually observe?"), `qa-expected`, `qa-classification`, with drafts kept per-scenario in the browser and carried across builds under an explicit "these were written against another build" notice.

The surface extended in the two preceding runs — `/workspace/qa/core-financials`, i.e. `app/adminV2/system/qa/core-financials/DirectorQaClient.tsx` — is the **superseded** one. The integration was built in the room that was abandoned on 2026-09-14.

## 2. Shell-less, not unauthenticated — the terminology that matters

The canonical Director QA is **shell-less but authenticated**. It is **not** "public QA", not
"anonymous Financials QA", and not "no-auth Financials QA". Those phrasings were used in the first
draft of this document and are wrong; they describe a product nobody asked for.

What "without logging into Alloy" names is the **absence of the operator shell**: no sidebar, no
BOS, no navigating the workspace or passing through Financials to reach the script. The page
resolves on its own URL, in its own tab, beside the product. That is a statement about **chrome**.

The **authority is unchanged and lives where it always did — on the data, not the route.**
`/api/admin/qa/financials-director` calls `requireAdminOrOps()` on both GET and POST, and
`assertFinancialsReadAllowed` on GET, under its own stated reason: *"Being an internal QA tool is
not a reason to read money more cheaply than the product does."* None of that was touched.

Measured, before the change, against this lane's own server with no cookies sent:

| Request | Result |
|---|---|
| `GET /dev/core-financials-qa` | **200** — the frame |
| `GET /api/admin/qa/financials-director` | **401** — no money |

| String in the cookie-less response | Occurrences |
|---|---|
| `Core Financials Director QA` | 1 |
| `Reading the environment…` | 1 |
| `Start walkthrough` | **0** |
| `Certhouse` | **0** |

So the route was never gated and the data was never open. A visitor without a session gets the
frame and a heading, and no scenario, fixture, household or balance reaches their browser. **No
token or share-link model has ever existed here** — a pickaxe across the full history for
`qa_share_token`, `qaShareToken` and token-shaped parameters on QA APIs returns nothing.

## 3. The decision, and what it changed

**Option A, chosen by the Director.** Deploy the historical interaction model. Option B — signed QA
share tokens, public tenant-money access, a new QA authorization system — was explicitly refused
and was not built.

One line of product code changed:

```diff
-    if (isHostedRuntime(classifyPublicRuntime())) {
-        notFound();
-    }
     return <CoreFinancialsQaReader />;
```

The gate called itself "local by construction", and the word doing the work in that phrase was
never *local* — it was *shell-less*. Nothing about reading a script beside the product requires the
page to be absent from the only deployment anyone is being asked to accept.

`requireAdminOrOps()`, `assertFinancialsReadAllowed` and the result-write authorization are
untouched. The route becoming hosted does not change the data authority, and the anonymous
behaviour above is now asserted on the deployed route rather than described here.

### A defect found while proving the notes

`ResultRow.observation` was typed and served by the route and **never rendered by either surface**.
A recorded note went into the store and disappeared from the only place anyone would look for it —
"the notes persist" was true of the database and false of the Director's experience. The scenario
now reads its recorded testimony back, deliberately outside the form so an old note cannot be
mistaken for an unsent draft.

The first version of that fix excluded `not_run` rows, which would have hidden the read-back in
exactly the case the Director's own notes proof uses. A render test caught it.

## 4. The integrated catalog, on the correct surface

The integrated catalog now lives on this surface. `1e05df7b5`, `ecb859857`.

- The `HUMAN_WALKTHROUGH`-only filter is gone. It was the "no automatic pass" rule inverted — nine suite-certified Autopay scenarios were in the catalog, served by the route, named in the component, and removed from the walk three lines below the name.
- `EXPLICITLY_DEFERRED` scenarios are in the walk, so a deferral is something the Director reaches and records, not a gap in the numbering.
- **DEFERRED** is an answer beside BLOCKED. "This environment cannot reach it, by a decision already made" is not "something stopped me".
- Evidence classes render per scenario, in the Director's words — *real Stripe TEST act*, *spends a controlled fixture*, *read only — changes nothing*.
- The boundary that explains a deferral renders on the scenario that meets it.
- The fixture doctrine is stated **before** the first scenario rather than inside the one that would spend an account.
- Acceptance records on a Bend Pine primary, and the controls carry the `data-testid` they were always passed.

Proven by rendering, not by grep: `tests/qa/coreFinancialsQaReaderRender.test.tsx` mounts the component against a stubbed route response and asks the DOM. Narrowing the filter back and suppressing the evidence chips turns exactly two of its six red and leaves the other four green.

## 5. One room. The other one is gone

`app/adminV2/system/qa/core-financials/` is **deleted** — both `page.tsx` and `DirectorQaClient.tsx`
— and its rewrite under `/workspace` is replaced by a **permanent redirect** to
`/dev/core-financials-qa`.

A redirect rather than a 404, because that path was a working URL which people and this
repository's own certification spec both pointed at, and there is exactly one place it can mean.
There is no plan under which an operator-shell Financials QA returns.

Shared authority was preserved, because it was never the problem: the scenario catalog, readiness,
the QA API, the result vocabulary, persistence, the notes authority and the DEFERRED semantics are
all untouched and all still shared. What was deleted is the **room**, not the authority. The two
things that were genuinely surface-specific to the wrong room — its demo-path view and its
`data-adminv2-director-qa` chrome — went with it.

No QA record was touched. Both surfaces always read and wrote the same table through the same
route, so removing one reaches no result. The four pre-existing results (1 pass, 1 blocked, 2 not
run, across `core_financials_director_qa` and `staffing_v1_human_qa`) are intact.

## 6. Canonical

One Director QA URL:

```
https://staging.workwithalloy.com/dev/core-financials-qa
```

Shell-less. Authenticated on the data. Scenario by scenario. With notes.
