---
owner: platform
status: canonical
classification: INTERNAL
audience: Alloy product and engineering
last_reviewed: 2026-09-22
supersedes: []
---

# Thread 7 — External lifecycle, scope model and package export: Human Review

One review, nine things to judge. Automated checks are cited as evidence; they
are not the review.

**Where to look:** Organization → Integrations (the grant surface), then
→ Developer documentation → API Reference (nineteen operations), and
`docs/api/developer-platform/package/` on disk.

---

## 1. The scope model

Eleven grantable scopes, frozen as ratified operator copy. The list and the
wording are locked by test, so changing either is a decision rather than a side
effect of adding an endpoint.

**To judge:** open Integrations and read the permission list as an operator
would. Does each sentence describe a decision someone can actually make?

## 2. `context.read` is gone from the grant model

It never gated anything — `GET /api/v1/context` requires a valid token and no
scope. It was offered to operators, approved by them, and granted nothing.

It is still *recognised*, so an installation that already holds it keeps
presenting as a known permission rather than degrading to the "unrecognised"
state, which is deliberately shown as the more dangerous kind.

**To judge:** is retiring a permission that grants nothing the right call, or
would you rather keep the checkbox for continuity with anything already issued?

## 3. What `.read` means

`.read` is permission to read one canonical resource and nothing adjacent.
`.write` is permission to invoke specific named operations, and grants no
reading at all — an installation with `enrollment.write` alone cannot read a
single enrollment. No read implies a write; no write implies a read.

## 4. The lifecycle matrix

`23-external-lifecycle-matrix.md` classifies all nine resources:
create, change, end, delete, canonical owner, and V1 disposition.

**To judge:** the classifications, particularly the four that are *not*
read-only by accident — Children and Relationships are `DOMAIN_OPERATION_GAP`,
Locations and Households are read-only **by design**, and Staff is ready but
deliberately unshipped.

## 5. Why named operations replace `PATCH`

A partner submits `POST /enrollments/end`, never `PATCH status_key`.

This is not a style preference. The canonical services enforce it: placement and
schedule export `assertNoOperationalPlacementPatch()` and its sibling, so
in-place mutation of an effective-dated row is refused for every caller
including Alloy's own surfaces.

`end` is one intent with three canonical outcomes — cancel, mark ending, close —
chosen by Alloy from the record's current state. **To judge:** that is Alloy
taking responsibility for a decision rather than handing a partner a state
machine. Deciding wrongly would leave a child enrolled.

## 6. Which resources are intentionally read-only

Locations, because site and room topology is how an organization describes
itself and every other resource names a place using it. Households, because a
household is an account carrying financial responsibility this API does not
expose. Schedule days, because it is derived.

**To judge:** are those the right lines?

## 7. How things end

No resource on this API supports physical deletion, and the partner
documentation says so plainly so an integrator does not wait for `DELETE`
endpoints that are not coming. Endings are archive, effective end, supersession
or reversal.

Supersession is what keeps a partner's mirror correct: the record they stored is
never rewritten, so the change arrives through ordinary synchronization.

## 8. The regenerated Classroom Coach package

Six files, `PARTNER_READY` — unchanged, and yours to change separately.

New: worksheet §7 asks which of the nine governed operations Classroom Coach
actually needs, and six more discovery questions cover whether their design
assumes a delete or a field-level update. Every provider column reads
**"Provider confirmation required"**, and a test holds it that way.

**To judge:** is asking "which of these do you need?" better than proposing a
mapping? And is the closing line right — that the distinction between *not
built* and *decided against* determines whether something can change at all?

## 9. The export workflow

`npm run export:partner-package` rebuilds from canonical sources, verifies
currency, archives, verifies the archive's contents, and prints one absolute
path. The archive is git-ignored; a generated binary is not committed.

**To judge:** whether one command and one `scp` is the workflow you want, or
whether this should eventually publish somewhere.

---

## Evidence

478 tests green across 28 files, including 33 live specs for the six new
operations and 90 for the reads. Seven prebuild guards green. Canonical
`tsconfig.build.json` typecheck and production build both passed through the
broker, with all fifteen `/api/v1` paths in the build output. The mounted
reference renders all nineteen operations and scans clean of implementation
leakage.

Three findings worth naming, each caught by writing the certification rather
than by review:

1. **The flagship operation could never have worked.** Child authority was
   visibility, and visibility requires an enrollment — so starting an enrollment
   required already having one. Authority is now visibility *or* an
   installation-scoped correlation mapping.
2. **A real concurrency gap.** Two simultaneous starts returned `500` for an
   operation that had succeeded. The creates now re-read and return the winner.
3. **An environmental regression, not a code one.** Every live suite failed as a
   credential error; the lane server had come back pointed at hosted rather than
   the certification stack. Reverting all local changes reproduced it exactly,
   which is how it was attributed correctly.

Nothing has been pushed, promoted or deployed.
