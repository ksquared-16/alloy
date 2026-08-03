# A refusal must not remove the way out — `grain_ambiguous` and the dead destination

**Status:** IMPLEMENTED + BROWSER-CERTIFIED (2026-07-30). **Owner doc:** `RUNTIME-V1-CERTIFICATION-SPRINT.md`.
**Found by:** the Second Surface inventory (`SECOND-SURFACE-INVENTORY.md` §1a). **Decision:** Kelly — "Runtime:
make the refusal honest, not fatal."

---

## 1. The defect, as an operator met it

`/workspace/work-unit/active-pipeline` is a destination the operator's own sidebar renders. On the certified
tenant it rendered, in full:

```
Follow Up
Work View "Active Pipeline": lens spans 2 Row Grains (family, child) — a surface cannot be grain-ambiguous
Select a record to begin
```

Measured: **0 lens pills · 0 cards · 0 rows · no retry**, and with the sidebar collapsed (its default) there
was no in-surface route anywhere else. The refusal itself was **correct** — law G-1 ("a surface cannot be
grain-ambiguous", `workUnitProvisioningAnswer.ts:360-380`) is right, and Firefly's Active Pipeline lens
genuinely spans `family` (`lead`) and `child` (`decision`). What was wrong is that a correct refusal had
become a **dead end**.

Two independent faults, both in how the refusal was *represented*:

1. **The error terminal discarded the navigational frame.** `workUnitSurfaceModelFromSnapshot` hard-coded
   `workViews: []`, on the reasoning that an error has "no lens set to render". That is true of the *answer*,
   not of the *world*: by the time the grain check runs, the lens set has been resolved for ~110 lines.
2. **No renderer read the error `code`.** So an invalid tenant **configuration** and a missing **record**
   produced a visually identical anonymous red sentence. The operator could not tell "someone has to fix
   this Work View" from "nothing is here" — and only one of those is anybody's job.

## 2. The change (two bounded pieces, no new coordinator)

**(a) A refusal carries the frame it already had.** The error variant gains
`navigationFrame: { lensSet, activeWorkView } | null`, threaded explicitly through `fail(...)`:

- passed at every refusal **after** the lens set exists — `grain_ambiguous`, `records_unavailable` (row read),
  `subject_unavailable` ×2, `no_truthful_primary_action` ×2;
- **`null`** at every refusal **before** it — `unauthorized`, `work_unit_not_found`, `no_business_process`,
  `no_active_view`, plus the kernel's deadline and transport terminals.

Threaded as a parameter rather than captured from an enclosing variable **on purpose**: a closure would
silently hand the early failures an empty or stale frame instead of an honest `null`, and an empty pill strip
is a false affordance while a stale one lies about which lens is active.

Counts stay `null` on all of them — counts are settlement (U-S6) and this answer never reached it. A pill with
no badge is honest; a zero would be a claim. (`WorkViewPillStrip.tsx:70-79` renders a `null` count as
`invisible` + `aria-hidden`, so no badge appears. Note for future probes: the hidden node still contains the
text `0`, so `textContent` scraping reads "New Leads0" for a card that displays no badge at all.)

**(b) A refusal says what KIND of problem it is.** New total function
`provisioningErrorKind(code): "authorization" | "configuration" | "subject" | "records"` — derived, never
stored, so it cannot drift; adding a code without classifying it is a compile error. Surfaced as
`queue.errorKind` and rendered as a lead line above the answer's own verbatim message (which is the only
thing that names *which* Work View and *why*).

**Latent hole found while doing it:** all three kernel-side error terminals are built with
`as ProvisioningAnswer`, so TypeScript never checked them — and two were **already** missing
`presentation_ms` from their timings. `navigationFrame: null` and the missing timing are both now explicit.
The casts are left in place (removing them is a separate cleanup), but the comment records that they defeat
the type system at exactly the place a new required field would otherwise be caught.

## 3. Certification

**Browser, authed, certified tenant, dev server on `:3013`.**

| Check | Before | After |
|---|---|---|
| `active-pipeline` lens pills | **0** | **5** — New Leads · Active Pipeline · Registration · Waitlist · Tours |
| refused lens still identifiable | n/a | `aria-selected="true"` on Active Pipeline |
| error classified in the DOM | none | `data-queue-error-kind="configuration"` |
| operator-facing lead line | none (raw internal sentence only) | "This Work View can't be shown until its configuration is fixed." + the original message beneath |
| **can the operator leave?** | **no** | **yes** — clicking the New Leads pill clears the error state |
| visible counts on the refusal | n/a | none (honest — settlement never ran) |

**No regression on the working path:** `/workspace/work-unit/new-leads` → 4 cards, subject resolved,
`published-lanes`, `errorKind=null`, **0 page errors, 0 console errors**. `/workspace/work-unit/registration`
→ unchanged honest empty ("No records in this view"), `errorKind=null`.

**A consequence I flagged, measured, and did not find.** Populating `workViews` on an error surface also feeds
the sibling-lens prewarm sweep (`useCommittedWorkUnitSurfaceRuntime.ts:235` derives `siblingViewIds` from
`model.workViews`), which previously had nothing to iterate. The worry was that a *refused* page would now
fire four heavy provisioning composes. **Measured: the refused surface still issues exactly ONE provisioning
answer within 30 s — unchanged.** The sweep does not fire there. I did not establish *why*, so this is
recorded as an observation, not an explained mechanism; if a future change makes the committed-surface
runtime mount on error terminals, re-measure this before assuming it stayed at one.

**Gates:** `vac run typecheck` **rc=0**. New guard test
`tests/adminV2/runtime/provisioningRefusalStaysNavigable.test.ts` **6/6** — it pins navigability *and* the
opposite invariant (a pre-lens refusal must offer nothing), plus no-counts-on-a-refusal and total
classification. Directly-affected suites (snapshot renderer, settlement, destination, workspace assembly,
the new guard): **35 tests, 5 files passed**; the sixth (`d1ProvisioningAnswerRoute`) fails to collect on
`Cannot find package 'server-only'` — an inherited environment failure in a file this change does not touch.

**A stale test corrected rather than left green.** `d4SnapshotRenderer.test.ts` asserted `workViews: []` on an
error under the comment *"no lens set pretending to be operational"*. It still passed — but only because its
fixture omits `navigationFrame`, so it was passing for the wrong reason while asserting a law this change
deliberately reverses. The assertion now pins the honest *frameless* case (a refusal before lenses resolve
offers nothing) and points at the navigable case's own test.

**Repeated run cancellations, stated so no result is over-claimed.** Three attempts at the broad
`tests/runtime` + `tests/adminV2/runtime` sweep were killed from outside (exit 144 with zero output; exit 143
`class=cancelled`; one operator error — a wrong `web/`-prefixed path, which the broker correctly classified
as `config`). Partial output from a cancelled run showed failures only in areas this change does not touch,
but **a cancelled run is not a result and nothing is claimed from it.** The full-suite name diff against
`origin/staging` is still owed before merge, and must be run in chunks that complete.

**Honest scope limit.** This makes the refusal navigable and legible. It does **not** decide whether a lens
may span grains — law G-1 is untouched, and Firefly's Active Pipeline lens is still refused. Whether that
lens should be reconfigured, or whether multi-grain lenses should become legal, remains open and is a product
decision (`SECOND-SURFACE-INVENTORY.md` §4, R11). What changed is that being refused is no longer a trap.

## 4. Defect observed in the validation broker (recorded, not fixed here)

`vac run typecheck` on a **genuine** TypeScript error (rc=2, real diagnostics printed) reported:

```
FINISH kind=typecheck rc=2 class=config
warning: typecheck FAILED TO START (CLI/config error, not a test failure) — result not cached.
warning: the command never ran: node … tsc -p tsconfig.build.json --noEmit
```

The command **did** run and produced real type errors. `alloy_classify_exec_failure` treats tsc's `rc=2` as a
CLI/config failure, so a real failure is both mis-described ("never ran") and — correctly for config, wrongly
here — left uncached. Belongs to the Vacilando broker, not Runtime; recorded so the next broker session has
the reproduction.
