# Waitlist ordering repair — dry run

Firefly, INFANT section. Nothing in this document has been applied.

> ## STATUS: CONDITIONAL — one assumption is load-bearing and is under test
>
> Everything below rests on candidate `94984f6c` **not rendering** in the twelve-row section.
> When this was first written that was treated as a detail. It is not: if that candidate
> renders, it held an active pin at ordinal 2 throughout, the pinned set used in the derivation
> is wrong, and **the target below is void.**
>
> The evidence currently points at "does not render", and it does so from two directions.
> Replaying the captured list reproduces it only with that candidate absent; replaying the
> damaged list likewise, and no ordinal from 1 to 12 makes the damaged list reproduce with it
> present. Two independently observed renders agreeing is real evidence.
>
> Against that, census `gar_b82c1696cf0457` reports it `active`, in `infant_0_18_months`, at the
> same site as the other five — which would ordinarily mean it renders. That inference assumes
> "active and in the cohort" is sufficient for queue membership, which is an assumption about
> queue scope rather than a rule anyone has checked. Queue rows project from opportunities, so an
> opportunity outside queue scope would explain the contradiction exactly.
>
> Census `gar_f67e20ce1b87e5` asks. **Do not apply this plan until it returns.**

## What is being repaired, and what is not

A faulty writer renumbered manual-position overrides using a tie-break the renderer does not
share: it ordered equal ordinals by `created_at`, the renderer orders them by natural rank. The
two disagreed and four director adjustments moved on their own.

The repair restores **operator intent**, not an old snapshot. Every legitimate override keeps its
identity, actor, reason, `created_at` and provenance. Only the ordinal — the *representation* of
the position — is rewritten, and only where that is required to reproduce what the operators
actually asked for.

## The timeline, from `updated_at`

`qa/census/waitlist-override-identity.sql.results.json` dates every write:

| time | what happened |
|---|---|
| 2026-09-11 15:45:31 | QA pins Wrigley at ordinal 4 (override `7e83e653`) |
| 2026-09-11 16:24:18 | **the damage** — three overrides renumbered in one pass: `94984f6c` 2→3, TP3 3→7, TP8 2→4 |
| 2026-09-11 16:25:47 | PassB Kid inserted at ordinal 8. `created_at == updated_at`, so nothing ever rewrote it |
| 2026-09-11 16:25:57 | TP6 2→3, collateral from PassB's move |
| (later) | Wrigley's QA override cleared |

Two things follow, and both matter.

**The damage preceded PassB's adjustment.** The operator chose position 8 while reading a list
that was already wrong. The requested number is still unambiguous — that row was never
rewritten — but it was chosen against damaged neighbours. The repair replays the number against
the *legitimate* list. That is a deliberate choice, not an oversight: the Director ruled that
PassB's adjustment stands as newer operator intent, and the intent recorded is "position 8".

**The captured list was taken while a QA pin was live**, so it is not self-evidently the
legitimate baseline. It had to be derived, not assumed — see below.

## The captured list is the legitimate pre-QA list (derived, not assumed)

Wrigley held QA pin `7e83e653` at ordinal 4 when the baseline was captured. That pin turns out to
have been **order-preserving**: ordinal 4 seated Wrigley exactly where his natural rank already
put him, once the three legitimate pins were placed ahead of him.

This is proven rather than eyeballed. The true natural order is underdetermined — TP8, TP6 and
TP3 have been pinned since 14:55 and their natural rank has never been displayed — so every
natural order consistent with **both** observed renders was enumerated (660 of 1320 candidates
survive). Replaying the legitimate-only pin set `{TP8:2, TP6:2, TP3:3}` over each one reproduces
the captured list **in all 660 cases**. The QA pin changed nothing, so the capture is clean.

## The chain

```
1  CAPTURED PRE-QA    PassA TP8 TP6 TP3 Wrigley TP11 PassB TP10 TP7 TP5 TP4 TP9
2  PASSB LEGITIMATE   planListMove(preQaOrder, PassB, 8)
3  TARGET ORDER       PassA TP8 TP6 TP3 Wrigley TP11 TP10 PassB TP7 TP5 TP4 TP9
4  CANONICAL ORDINALS TP8=2  TP6=3  TP3=4  PassB=8
5  REPLAYED ORDER     PassA TP8 TP6 TP3 Wrigley TP11 TP10 PassB TP7 TP5 TP4 TP9

   REPLAYED === TARGET   ✓ exactly
```

Step 4 is `deriveCanonicalManualOrdinals`; step 5 is `resolveOrderFromOrdinals`, which is the
renderer's own placement rule. The writer proposes nothing the renderer has not confirmed.

**The plan does not depend on the unknown.** Running steps 4–5 against all 660 consistent natural
orders yields exactly **one** distinct ordinal plan, and it reproduces the target in every one of
them. What is unknown about the natural order turns out not to be load-bearing.

## Override-level dry run

| Child | Candidate | Override | Actor | Created at | Pre-QA ord | Damaged ord | Requested pos | **Repaired ord** | Pre-QA pos | Damaged pos | **Target pos** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Test Process8 | `e392cb90` | `d0953b15` | `b2562c99` | 2026-09-11 14:55:01 | 2 | 4 | — | **2** | 2 | 4 | **2** |
| Test Process6 | `89729749` | `82cbc16f` | `b2562c99` | 2026-09-11 14:55:11 | 2 | 3 | — | **3** | 3 | 3 | **3** |
| Test Process3 | `9e230cf8` | `f64c8389` | `b2562c99` | 2026-08-26 14:58:39 | 3 | 7 | — | **4** | 4 | 7 | **4** |
| PassB Kid | `b34bbdec` | `e23d6d6d` | `b2562c99` | 2026-09-11 16:25:47 | (new) | 8 | **8** | **8** | 7 | 8 | **8** |
| *(unresolved)* | `94984f6c` | `489a6460` | `b2562c99` | 2026-08-21 16:26:10 | 2 | 3 | — | *held* | — | — | — |
| Wrigley Kurzman | `698f850a` | `7e83e653` | QA | 2026-09-11 15:45:31 | — | cleared | — | *stays cleared* | 5 | 2 | **5** |

All reasons are "Manual waitlist position adjustment". No actor, reason, id or `created_at` is
modified by the repair.

Note that **TP6 and TP3 change ordinal VALUE but not POSITION** — 2→3 and 3→4. That is the
duplicate-ordinal representation being normalised into unique positions, which is precisely what
makes the writer and the renderer agree in future. Their displayed rank is untouched.

## Rows that actually move

| Row | Pre-QA pos | Target pos | |
|---|---|---|---|
| PassB | 7 | **8** | the legitimate adjustment being honoured |
| TP10 | 8 | **7** | displaced by PassB — the necessary consequence |

Every other row — PassA, TP8, TP6, TP3, Wrigley, TP11, TP7, TP5, TP4, TP9 — sits at exactly the
position it held before QA touched anything. The repair is minimal in the strict sense: no row
moves that does not have to.

## The row that is held — and why it decides the whole plan

Override `489a6460` points at candidate `94984f6c`, which appears in none of the twelve rendered
rows. It cannot disturb the target — a row that does not render cannot occupy a position — so the
plan above stands without it. But its ordinal was damaged 2→3 like the others, and restoring it
to 2 would reintroduce a duplicate of TP8's ordinal **if** it shares the section.

That was the original reason for holding it, and it was too weak. The real stake is larger:
this candidate held an **active pin at ordinal 2** from 2026-08-21 onward, confirmed by census
`gar_a2ceb4b3fce6d2` at 15:49, which recorded FIVE active pins and not four. The derivation above
uses four. If the fifth belongs in the section, the derivation is not merely incomplete — it is
unsound, and the target is void.

The renders say it does not belong: with the fifth pin included, neither observed list can be
reproduced at all, for any assignment of that candidate to a visible row and any natural order
(0 of 7 × all orders), and no ordinal from 1 to 12 rescues the damaged list. Without it, both
reproduce. But census `gar_b82c1696cf0457` reports the candidate `active` in the same cohort at
the same site, which cuts the other way.

That contradiction is a fact about the tenant, not something to resolve by preferring the reading
that keeps the plan alive. Census `gar_f67e20ce1b87e5`
(`qa/census/waitlist-candidate-opportunity.sql`) asks whether its opportunity is in queue scope,
and returns the child names that have been missing throughout. **The plan is not applicable until
that returns.**
