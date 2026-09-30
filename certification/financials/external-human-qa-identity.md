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

## 2. "Accessible without logging into Alloy": half true, and the half matters

Measured just now against this lane's own server (`http://localhost:3017`), with **no cookies sent at all**:

| Request | Result |
|---|---|
| `GET /dev/core-financials-qa` | **200** |
| `GET /api/admin/qa/financials-director` | **401** |

And what the cookie-less response actually contains:

| String | Occurrences in the served HTML |
|---|---|
| `Core Financials` | 1 |
| `Director QA` | 1 |
| `Reading the environment…` | 1 |
| `Start walkthrough` | **0** |
| `Certhouse` | **0** |

**The route has always been anonymous. The data never was.** There is no middleware gate on `/dev/*`, so a clean browser opens the page and sees the heading — then the walkthrough read 401s and it can walk nothing. Both `GET` and `POST` on `/api/admin/qa/financials-director` call `requireAdminOrOps()`, and `GET` additionally calls `assertFinancialsReadAllowed`, under a stated reason: *"Being an internal QA tool is not a reason to read money more cheaply than the product does."*

So the Director's memory is accurate about the experience and not about the mechanism. What was absent was **Alloy** — the shell, the sidebar, the navigation into an operator surface. What was present, invisibly, was an ordinary admin session in that browser, because the Director was already signed in on that machine.

**No historical token or share-link model ever existed.** A pickaxe search across the full history for `qa_share_token`, `qaShareToken`, `public QA`, and token-shaped parameters on QA APIs returns nothing. There is no old solution to restore.

## 3. Why it is not on staging today

`page.tsx` is three lines of gate:

```tsx
if (isHostedRuntime(classifyPublicRuntime())) {
    notFound();
}
```

`isHostedRuntime` is true for `production` and `hosted_preview`. Both `/dev/core-financials-qa` and `/dev/real-enrollment-qa` return **404 on staging** — verified by request, not by reading the source. The file states the intent plainly: *"LOCAL BY CONSTRUCTION — gated on the RUNTIME rather than on `NODE_ENV`."*

This is the conflict. The success condition asks for a **deployed URL a clean browser can open without normal Alloy login**. The historical architecture delivers neither half of that: it is not deployed, and it does not authorize a clean browser.

## 4. What was done anyway, because it is unambiguous

The integrated catalog now lives on this surface. `1e05df7b5`, `ecb859857`.

- The `HUMAN_WALKTHROUGH`-only filter is gone. It was the "no automatic pass" rule inverted — nine suite-certified Autopay scenarios were in the catalog, served by the route, named in the component, and removed from the walk three lines below the name.
- `EXPLICITLY_DEFERRED` scenarios are in the walk, so a deferral is something the Director reaches and records, not a gap in the numbering.
- **DEFERRED** is an answer beside BLOCKED. "This environment cannot reach it, by a decision already made" is not "something stopped me".
- Evidence classes render per scenario, in the Director's words — *real Stripe TEST act*, *spends a controlled fixture*, *read only — changes nothing*.
- The boundary that explains a deferral renders on the scenario that meets it.
- The fixture doctrine is stated **before** the first scenario rather than inside the one that would spend an account.
- Acceptance records on a Bend Pine primary, and the controls carry the `data-testid` they were always passed.

Proven by rendering, not by grep: `tests/qa/coreFinancialsQaReaderRender.test.tsx` mounts the component against a stubbed route response and asks the DOM. Narrowing the filter back and suppressing the evidence chips turns exactly two of its six red and leaves the other four green.

## 5. What was deliberately NOT done

**`/workspace/qa/core-financials` has not been deleted.**

Deleting it now would leave the Director with **no hosted QA surface of any kind**, because the correct surface 404s on staging. The order in the instruction is delete *after* the correct surface is restored and proven; the proof cannot be produced until §6 is answered. The deletion is ready and is one commit once the access model is settled.

No QA record was touched. The four existing results (1 pass, 1 blocked, 2 not run, across `core_financials_director_qa` and `staffing_v1_human_qa`) are intact; both surfaces read and write the same table through the same route, so a surface change does not reach them.

## 6. The decision that cannot be made here

A deployed, walkable external QA surface requires choosing one of these. They are not equivalent and the difference is an access-control decision about tenant financial data.

**A — Lift the runtime gate only.** Delete the `notFound()` so `/dev/core-financials-qa` resolves on staging. Everything else unchanged: the API still requires admin/ops, the page still has no shell. A Director already signed in on that browser opens the URL in a second tab and walks. A clean browser sees the heading and an error.
*No new auth surface. Exactly the historical model, reachable where it is needed. Does not satisfy "without normal Alloy login" literally.*

**B — A scoped, expiring QA read grant.** A signed walkthrough link that authorizes the QA route alone, for one catalog version, for a bounded window, read plus its own result writes, no other Financials API.
*Satisfies the success condition literally. It is new architecture and a new authorization path onto money — the thing the instruction warns against building casually. It should not be invented inside a run whose brief was to recover something that already existed.*

**C — Local only, as built.** The Director runs it beside the product on a machine with a lane server.
*Truest to the historical architecture. No deployed URL, so the final operator handoff is not a link.*

**Recommendation: A**, now, with B as a separate piece of work if the literal no-login requirement is real. A restores the actual historical experience — beside the product, no operator shell, notes, one scenario at a time — and the only thing it asks of the Director is the session their browser already has. B is the only option that meets the words of the success condition, and it deserves its own brief rather than being smuggled into this one.
