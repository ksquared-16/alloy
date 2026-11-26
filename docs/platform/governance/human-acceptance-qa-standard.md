---
owner: platform
status: canonical
last_reviewed: 2026-09-15
supersedes: []
---

# Human acceptance QA — the platform standard

**Status:** approved directionally by the Director, Thread 11A Repair Pass 3.
**Reference implementations:** Core Financials (`/dev/core-financials-qa`), Enrollment (`/dev/real-enrollment-qa`).

This document is the standard, not a proposal. It describes the pattern both reference
implementations already prove, so a third product does not have to invent a fourth walkthrough
format to get a human to sign off on it.

---

## 1. Why a separate thing from certification exists at all

Automated certification and human acceptance answer different questions, and neither substitutes
for the other.

| | Automated certification | Human acceptance |
|---|---|---|
| Asks | "Does the invariant still hold?" | "Can an operator do the job, and does the product tell the truth while they do it?" |
| Evidence | A green suite | A named person's recorded judgement |
| Binds to | The commit | `scenario × scenario-definition-version × tested-product-baseline × tester` |
| Fails on | A broken assertion | Confusion, a dead control, a plausible-looking wrong number |

A suite can be entirely green on a surface no operator can reach. Thread 11A exists because that
happened: Scenario 01 reported READY on the strength of an API read while the household was not
listed on the only screen the walkthrough's first instruction names. **A passing test is not a
performed walkthrough**, and the acceptance record must never be writable by anything but a human
choosing a result.

---

## 2. The human QA experience

### The route

* `/dev/<product>-qa` — one route per product acceptance suite.
* **Outside the authenticated product chrome.** No sidebar, no Focus Panel, no BOS. The Director
  keeps the script in one tab and Alloy in the other; a QA page wearing the product's own chrome is
  neither a script nor the product.
* **Local by construction, and gated on the RUNTIME rather than on `NODE_ENV`.** A QA server is
  deliberately a production *build*, so a `NODE_ENV` check 404s the page on the one server it is
  meant to be read beside. Use `isHostedRuntime(classifyPublicRuntime())` and `notFound()`. A
  Vercel production or preview deployment is hosted; a developer machine is not.
* The product is opened **separately and deliberately**, from a control on the page.

### The surface

One scenario at a time, and for that scenario:

* the **verified starting state**, read live at open — never a constant written down at authoring
  time, which is a number that is true once;
* **exact navigation**, in the labels the build actually renders;
* **exact actions**, short and numbered;
* **expected changes**;
* **expected unchanged state** — this is usually where the real defects hide;
* **failure symptoms**, so a tester recognises one rather than reasoning toward it;
* **PASS / FAIL / BLOCKED / NOT RUN**;
* notes, classification, evidence reference;
* **resume**;
* **baseline awareness**.

### Readiness is two answers, never one

* **DATA_READY** — the subject's facts satisfy the scenario's preconditions.
* **NAVIGATION_READY** — an operator can actually *reach* the subject on the surface the scenario
  navigates to.

Report them separately and gate the start control on both. Resolvability is not navigability. A
navigation check must interrogate the **cohort/resolver contract that powers the surface**, never a
named subject: a check that names the demo household passes the moment somebody special-cases that
household, which is the failure mode the check exists to catch.

---

## 3. The scenario contract

Each scenario owns, and a runtime may assume nothing else:

| Field | Rule |
|---|---|
| `key` | Stable across renumbering. Results persist against this, never against display order. |
| `order` | Display only. |
| `title`, `purpose`, `whyItMatters` | Plain language, for someone who does not read code. |
| `disposition` | `HUMAN_WALKTHROUGH`, or a deferral with a **stated reason**. |
| `requires` | Preconditions, as a **closed set** of named checks. A free-form predicate lets the harness start answering domain questions of its own. |
| `navigate` | Exact product path. An empty list means the scenario navigates nowhere and must not be blocked on navigation. |
| `doThis` | Numbered actions. |
| `expectChanges` / `expectUnchanged` | Both required. The second is the load-bearing one. |
| `invariant` | The one law the step protects. |
| `failSymptoms` | What a failure looks like from the outside. |

Deferral is a first-class disposition and needs a reason, not silence. "Deferred because no test-mode
merchant exists on this tenant" is a disposition; an absent scenario is a gap nobody can see.

---

## 4. The acceptance contract

Human acceptance binds to the tuple:

```
scenario × scenario-definition-version × tested-product-baseline × tester
```

Consequences that are not optional:

* **Results are read for the tested build only.** Reading across revisions lets yesterday's ticks
  vouch for code nobody has looked at.
* **A changed baseline is reported, never silently reused.** Earlier builds' answers stay in the
  table and stay legible; they simply do not count as this build's.
* **A changed scenario-definition version is a changed question.** Bump it when the definitions
  change, and let prior acceptances stay readable and stop counting.
* **The QA runtime writes only its own acceptance table.** It may import the canonical *read*
  authority — it must, or it becomes a second opinion about the domain's truth — but nothing that
  changes domain state. Hold that line with a test that names the mutation surface explicitly.

---

## 5. Session behaviour — position and draft testimony

A walkthrough runs for an hour beside a product under active repair. **The document will reload.**
The runtime's correctness may not depend on it surviving.

### The reload usually is not yours

Before adding state, find the owner. In the Financials case the measurement was unambiguous: 16
document loads produced 17 readiness fetches — one per load plus a retry after a 401 — and there was
no polling, no `router.refresh()` and no `location.reload()` anywhere in the route's tree. The owner
was `next dev`: Fast Refresh fully reloads a server-component route whenever anything in its module
graph changes, which on a lane under active repair is constantly.

That is worth stating plainly because it decides what to fix. **Do not add persistence to conceal a
reload loop the app itself is causing** — find and fix that. But when the reload is external and
legitimate, persistence is the fix, not a workaround.

### The invariant: the tool owns operator continuity

**A QA tool that loses the operator's place is not fit to certify anything.** This is not a quality
of implementation; it is a precondition for the testimony being worth recording. A Director who has
been thrown back to Scenario 01 three times stops trusting the record, and a half-written
observation that vanished is evidence that no longer exists.

So, stated as an invariant a future suite must satisfy before it is used for human certification:

> While the operator is on Scenario N, **only the operator may change the scenario.** A readiness
> refresh, a baseline change, a re-render, a remount and a reload must all leave them on N, with
> their draft observation, expected result and classification intact.

The failure that produced this rule is worth recording, because it is easy to reproduce by accident:
position was mirrored into storage by a `useEffect` that wrote whatever the current render held. On
every mount that effect fired in the same commit as the restore — *before* React had applied the
restored index — and wrote scenario 01 over the operator's real position, correcting it some
milliseconds later. Any reload, tab close or navigation landing in that window lost the place.

**An effect cannot distinguish "the operator moved" from "React rendered a default."** That is
exactly the distinction the invariant turns on, so position must be written by the handlers that
move it — Previous, Next, start, resume — and by nothing else. A surface with no code path from a
render to a position write cannot violate the rule by accident.

Two corollaries, both learned the same way:

* **A reload must not blank the surface.** Showing "Reading the environment…" for a second and a
  half on every reload reads as having been reset, whatever the runtime does with position
  afterwards. Cache the *shape* of the page — the scenario catalog, the environment labels — and
  never the figures: a cached balance is a stale balance, and a QA tool that showed one would be
  testifying about a number nobody just looked up.
* **A debounce is a hole.** Whatever interval you save drafts on, a reload can arrive inside it.
  Flush synchronously on `pagehide` and on losing visibility, or the last fraction of a sentence is
  lost exactly when the operator was mid-thought.

**And automated proof of this is not sufficient on its own.** The unit tests for the store were
green and the mounted test reloaded once, which is precisely one reload too few to see the clobber.
Certifying operator continuity requires a human-equivalent soak: a real dwell, real tab switching,
real reloads, and an assertion afterwards that the scenario and the draft are both still there.

### What persists where

| State | Owner | Lifetime |
|---|---|---|
| Current position | Browser (`localStorage`) | Per-browser, per-suite, per-environment |
| Draft observation / expected / classification | Browser (`localStorage`) | Until submitted |
| PASS / FAIL / BLOCKED / NOT RUN | Acceptance authority (server) | Permanent, baseline-bound |
| Deployed revision, catalog version | Server, per read | Derived, never stored client-side as truth |

### The rules

* **Position is keyed by suite and environment only, and stores a scenario KEY.** Neither a new
  build nor a renumbered catalog may cost the Director their place. A stored key naming a scenario
  the catalog no longer has falls back rather than pointing at whatever now sits at that index.
* **A reload lands exactly where they were** — including mid-scenario on one already accepted, since
  they may be re-reading it. **A fresh open resumes at the first unaccepted scenario**, which is the
  work remaining. `fail` and `blocked` are unaccepted.
* **Drafts are additionally keyed by catalog version and tested baseline**, because a half-written
  observation is about the build in front of you.
* **A build change must not destroy notes.** These two rules pull against each other, so: a draft
  written against an earlier build is *never adopted silently and never deleted*. It is offered
  back, labelled with the build and catalog it was written against, and the Director decides.
  Silence in either direction would be the tool making a claim nobody made.
* **A draft is not testimony.** Nothing partial reaches the acceptance record. On submission the
  scenario's drafts are cleared across builds, so submitted words do not reappear as unsubmitted.
* **Every storage access is guarded.** `localStorage` does not merely go missing on the server — it
  *throws* in a private window and with site data blocked. Degrade to forgetting, never to a white
  screen.

---

## 6. Environment honesty

A local QA reader may read staging or certification truth where explicitly configured. When it does,
it **must make the active data environment obvious on screen**.

Never present local fixture truth as staging truth. The environment and the tested build belong in
the reader's own header facts, beside the readiness answers, where the Director cannot miss them
while recording a result against them.

---

## 7. Adoption — what a new product supplies, and what it must not rebuild

A future domain should have to supply only:

* a **scenario catalog**;
* **readiness adapters** over its own canonical read authority (data and navigation);
* **product navigation** strings in the labels its build renders;
* **expected outcomes** and **failure signatures**;
* optionally a **fixture / reconciliation** path;
* domain-specific **evidence** fields.

It must **not** have to reinvent:

* the QA page shell or its local-only route protection;
* scenario navigation;
* resume behaviour;
* draft testimony persistence;
* result persistence;
* PASS / FAIL / BLOCKED / NOT RUN controls;
* classification;
* baseline awareness;
* data/navigation readiness presentation.

### The shared primitive that exists today

`web/lib/qa/runtime/directorQaSession.ts` — position and draft persistence, environment- and
baseline-keyed, with the carry-over rule. It is domain-agnostic and is already used by both the
local Financials reader and the hosted Financials harness.

### What has deliberately NOT been extracted yet

The page shell, the scenario renderer and the scenario *content format*. Enrollment parses a Markdown
walkthrough; Financials uses a typed catalog. **Do not force them onto one parser or one data format
yet.** Two implementations is the minimum evidence for knowing which parts are genuinely shared, and
a premature shell extracted from one of them would encode that one's accidents as the standard.

Extract the shell when both are merged and stable, and extract only what both actually do. Share the
runtime primitives; let scenario content sources differ.

---

## 8. Defect handling during a live walkthrough

* **Do not silently repair underneath an active human walkthrough.** A fix landing mid-pass changes
  the build the Director is testifying about.
* On a failure, **persist evidence before repair**: URL, scenario, baseline, subject, period,
  starting state, steps, expected and actual.
* Classify: `PRODUCT_DEFECT`, `CONFUSING_UX`, `GUIDE_MISMATCH`, `FIXTURE_DRIFT`,
  `ENVIRONMENT_RUNTIME`, `UNKNOWN_NEEDS_TRIAGE`.
* **Confusing UX with a correct invariant is still a finding.** Record it, classify it, and decide
  explicitly whether it blocks acceptance before advancing.
* **Stop scenario progression** when later scenarios depend on the failed state.
* Compatible findings may be batched into one coherent repair promotion.

---

## 9. States that must stay distinct in every report

1. implementation complete;
2. automated certification complete;
3. promoted / deployed;
4. **human acceptance complete**.

Only the fourth is the Director's to declare. Automated tests, mounted browser proof and
implementation completion do not substitute for it, and a report that collapses these four into
"done" has lost the only distinction this standard exists to protect.
