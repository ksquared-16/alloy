---
owner: platform
status: sprint
last_reviewed: 2026-09-03
supersedes: []
---

# 08 — Corpus reuse confirmation

> **Confirmation deliverable.** The mission compiled with **zero `to_execute` deliverables** and twelve
> reused artifacts, so its sole acceptance criterion is `AC_reuse_confirmed` —
> *"Operator confirms accepted Access & Identity artifacts satisfy the Mission Brief without new
> discovery"* (`mission-compiler.mjs:482-488`). This document is that confirmation.
> **The answer is yes, with three qualifications, none of which is new discovery.**

**Mission** `msn_ee5f60faa56ac0184d` v1 · phase *Confirm reused specification corpus* · assignment `asg_5faae7e021423b`
**contentHash** `811d73bdb8cf97f0593db86a3f906c01`
**Worktree** `wt5-vacilando` @ `fix/run-reconciliation-and-capacity-reason`
**Base** `a42526613` — `origin/staging`, 0 ahead / 0 behind
**Date** 2026-09-03
**Method** static and file-grounded. The corpus's own reproduce commands (`05…§10`) were re-run verbatim
against this checkout. No code changed, no test run, no browser opened, no database touched.

---

## 0. Headline

**Confirmed: every one of the brief's twelve required outputs is covered by an accepted artifact, and no
discovery deliverable is outstanding.** The corpus has been independently re-checked, not taken on trust.

Three qualifications, each already owned by the corpus and none of them worker-resolvable:

1. **The census figures are stale for the second time.** The enforcement denominator the brief's own threat
   statement rests on has moved again — **539 → 559 → 603 route files** — and no document records the third
   number until this one (§3).
2. **`X-2` (the corpus is not in one place) is now load-bearing in code, not just in prose.** The compiler's
   deliverable catalog resolves 4 of 12 entries *only* to the QA folder and 3 *only* to the product-source
   folder. **Neither folder alone satisfies the mission** (§4). The split has been adopted by use, exactly as
   `07…§8` describes happening to `X-9`.
3. **"No new discovery remains" was machine-decided by a file-existence test.** `artifactPresent()` accepts
   any file over 200 bytes; it reads no content (§1.1). The substantive claim needed a human check, which is
   what §2 is.

**What is genuinely closed:** `M3` — the unfalsifiable acceptance criterion that `00…§8`, `03…§26` and
`07…§3` each reported, and which `DR-7` asked be fixed — **has been repaired** at
`mission-compiler.mjs:489-504`. It is now a hard `unfalsifiable_acceptance` compile error. This mission is
the first in the sequence whose phase can actually close.

---

## 1. What this deliverable was asked to confirm

The assignment states the objective as *"No new discovery deliverables remain — confirm accepted artifacts
cover the Mission Brief"*, with an empty `scope` and an empty rendered acceptance list. That emptiness is
**not** `M2` recurring: it is the correct output for a mission with nothing to execute. The compiler records
`catalog_access_identity_v1` with `reused: 12, remaining: 0`, and the `!ac.length && reusedArtifacts.length`
branch then mints `AC_reuse_confirmed` with `evidenceType: "document"`.

### 1.1 What the machine actually tested — and did not

```js
// mission-compiler.mjs:183-196
function artifactPresent(relPaths) {
  for (const rel of relPaths) {
    const hit = resolveRepoPath(rel);
    if (hit) { const st = statSync(hit.absolute); if (st.size > 200) return { path: hit.relative, bytes: st.size }; }
  }
  return null;
}
```

**The test is existence and `size > 200`.** No hash, no content, no freshness, no section check. So
"reused: 12, remaining: 0" is a presence finding, and `01…§27` had already named this exact limit as the one
that bites: *"a coverage table that counts documents cannot see a gap that lives between them."* §2 and §3
are the check the compiler cannot perform.

---

## 2. The twelve outputs, re-confirmed

Assessed against the corpus as it stands at `a42526613`. The `Verified` column records what was checked
**this pass**, not what the owning document asserts.

| # | Required output | Owning artifact | Verified this pass | Verdict |
|---|---|---|---|---|
| 1 | Existing-state inventory | `01…` Part I · `authority-path-inventory.md` | Both present; `01…` is 2664 L in product-source | **Covered** |
| 2 | Surface & capability access catalog | `05…` §§1–5 | §§1–11 present; **figures stale — §3** | **Covered, stale figures** |
| 3 | Person ↔ user ↔ role ↔ scope model | `02…` Part I | 2665 L, Parts I–III present | **Covered** |
| 4 | Authentication model | `04…` | §§0–10 present, incl. §6.2 password baseline | **Covered** |
| 5 | Effective-access resolution model | `02…` Part II | Present and committed — `X-5` **closed** | **Covered** |
| 6 | Product IA & principal flows | `06…` | §§0–11 present | **Covered** |
| 7 | Security threat & enforcement matrix | `01…` Part II | Present; re-scoped in by the operator | **Covered** |
| 8 | Gap analysis | `01…` Part III, §26 register | 14 gaps, every finding bound exactly once | **Covered** |
| 9 | Decisions requiring approval | `02…`, `04…§7`, `06…§8`, `01…§19` | Present; **still not citable by number** — `X-1` | **Covered, at risk** |
| 10 | Sequenced implementation plan | `03…` §§1–29, 43–59 | Waves 0–14, `W-0`…`W-62`; **§23 binds every ID** | **Covered — staleness closed** |
| 11 | Director acceptance rubric | `07…` | `PG-1`…`PG-14`, `RB-1`…`RB-41` | **Covered, at risk** — `X-9` |
| 12 | QA & evidence plan | `03…` Part III §§30–42, Part V §§60–73 | `QE-1`…`QE-17`, `EA-1`…`EA-9` | **Covered — staleness closed** |

**Twelve covered · two at risk from register defects · zero absent.**

**This supersedes `01…§27`'s score on two rows.** §27 recorded #10 as *"Stale — covers ~a third of the
register"* and #12 as *"Stale with #10"*. Both were closed after it was written: `03…§23` is the coverage
artifact `01…§29` said was missing, and it now binds **twelve of fourteen gaps to workstreams**, with one
needing none by design and one (`GAP-14`) being Director-owned rather than engineering work. `03…` Parts III
and V supply the QA plan. §27 is correct as of its own date and should be read with this row set beside it.

**No output requires new discovery.** The one item `07…§7` flagged as genuinely non-existent — the Audit
Model (`GAP-10`) — is *scheduled* discovery: `03…§23.1` binds it to `W-23` Q7 ahead of wave 12, which is the
correct disposition. It is not an unmet deliverable of this brief.

---

## 3. The census has drifted a second time

`07…§7` warned that the route counts *"have already drifted once."* They have now drifted again. Re-running
`05…§10`'s own commands verbatim from `web/` at `a42526613`:

| Measure | `05…` (accepted, 2026-07-30) | `01…§26` / `07…§7` (M2) | **Today** | Δ since accepted |
|---|--:|--:|--:|--:|
| API route files | 539 | 559 | **603** | **+64** |
| Route files holding a service-role client | 507 | 534 | **563** | **+56** |
| Route files with any permission concept | 13 | 13 | **23** | +10 |
| `app/adminV2` pages | 68 | — | **67** | −1 |
| `app/legacy-admin` pages | 64 | — | **61** | −3 |
| Canonical registered actions | 9 | — | **9** | **0** |

Reading, stated conservatively:

- **`GAP-9`'s headline figure is wrong in every document that states it.** It reads *"534 of 559 route files
  hold a service-role client."* Today it is **563 of 603**. The gap is not closing; the denominator is
  growing faster than the enforcement.
- **Permission awareness nearly doubled (13 → 23) and is still ~3.8% of the surface.** The improvement is
  real and worth recording; it does not change any gap's severity.
- **The one number that did not move is the action registry** — 9, unchanged. `GAP-9`'s command-layer leg is
  therefore stale in its route half and accurate in its action half.

**This is drift, not a new finding.** It re-prices `GAP-9`, `GAP-4` and `05…`; it does not add a gap.
Recorded here because `07…§7` puts the census at the top of the *do-not-re-derive* list, and a reused figure
that is 64 routes stale would be quoted into Mission 3's acceptance evidence unflagged.

---

## 4. `X-2` is now enforced by code

`DR-4` asks *"Where is the canonical corpus?"* and notes that `ALLOWED_CHANGE_PREFIX` says the QA folder
while `PRODUCT-SOURCE.md` says the product-source folder — *"today nothing does [agree]."* The compiler has
since answered it in practice, by depending on both:

| Catalog entry | Resolves in |
|---|---|
| `d2_surface_catalog`, `d4_authentication`, `d6_product_ia`, `d11_acceptance_rubric` | **QA folder only** |
| `d8_gap_analysis`, `d9_decisions`, `d12_qa_evidence` | **product-source folder only** |
| `d1`, `d3`, `d5`, `d7`, `d10` | either |

**Consolidating on either folder alone would break the compile** — 4 entries or 3 entries would fall to
`to_execute`, and the mission would re-open discovery that is already done. This is the same mechanism
`07…§8` identified for `X-9`: *"the corpus has adopted (c) by writing it, not by deciding it."* It is now
true of `X-2` as well, and the cost of reversing it has risen from a file move to a compiler change.

**The two folders are not copies.** The manifest's `content_hash` pairs asserted identity at the 2026-07-30
closeout and no longer hold:

| Document | QA folder | Product-source |
|---|--:|--:|
| `01-existing-state-inventory.md` | 566 L | **2664 L** |
| `02-canonical-access-identity-model.md` | 719 L | **2665 L** |
| `03-implementation-qa-sequence.md` | 3851 L | **5594 L** |

Citations split across the divide accordingly: `00…§3` cites `01…:478-527` and *"(566 L)"*, which resolves
only against the QA copy, while `07…§7` cites `01…§26` and `03…§27.7`, which exist only in the
product-source copy. **No single folder contains a corpus in which every internal citation resolves.** That
is `GAP-14`'s concrete cost, and it is why the answer to `DR-4` should probably be *"both, declared"* rather
than a consolidation.

---

## 5. What remains open

None of it is discovery, and none of it is worker-resolvable.

| # | Open item | Owner | Note |
|---|---|---|---|
| 1 | **Ratify `D1`–`D8` / `AD-1`…`AD-21`** | Operator | `03…§27.7` makes ratification a prerequisite for the plan being *"safely quotable"*; Phase 5 acceptance inherits it |
| 2 | **`DR-4` / `X-2`** — declare the canonical corpus | Director | Now a compiler dependency (§4), not a filing preference |
| 3 | **`DR-6` / `X-9`** — ratify option (c) or pay (a) knowingly | Director | Unchanged; (c) remains in force by use |
| 4 | **`X-1`** — colliding invariant / decision numbers | Director | Blocks output #9 being citable by number |
| 5 | **Re-baseline the census** | Engineering | §3; a `W-14`-adjacent refresh, not new discovery |
| 6 | **`M1` / `M2` at ingestion** | Engineering | `M3` is fixed (§0); `DR-7`'s other two are unverified here |

**Implementation of Access & Identity V2 should still not begin until (1) is settled** — `00…§8`'s condition,
restated because nothing in this pass changes it.

---

## 6. Limits — read before citing

- **Static and file-grounded.** No database, no browser, no test executed. §3's figures are `find`/`grep`
  counts reproduced from `05…§10`, with that section's own caveats about what a route file "is."
- **Presence and internal consistency, not sufficiency.** This pass confirms the artifacts exist, cover the
  twelve outputs, and are mutually consistent where checked. It does **not** re-verify the corpus's factual
  claims about the product; `00…§6`'s caveat carries forward unchanged.
- **`M1`/`M2` were not re-tested.** Only `M3` was verified fixed, by reading the compiler. This mission's
  empty scope has an innocent explanation (§1) and was not treated as evidence either way.
- **The manifest hashes were not recomputed.** Divergence in §4 is established by line count and by section
  presence, which is sufficient for the claim made and does not depend on the hashes.
- **Section-level verification was sampled, not exhaustive.** §2's `Verified` column reflects heading-level
  presence plus targeted reads, not a full read of all ~16,000 corpus lines.

---

## 7. Reproduce

```bash
cd /Users/vacilando/Code/alloy-worktrees/wt5-vacilando   # @ a42526613

# §1.1 — the presence-only artifact test, and the criterion this mission compiled
sed -n '183,196p' scripts/local-dev/lib/vacilando/mission-compiler.mjs
sed -n '471,505p' scripts/local-dev/lib/vacilando/mission-compiler.mjs

# §0 — M3 is fixed: the tautology is now a compile error
grep -n 'unfalsifiable_acceptance' scripts/local-dev/lib/vacilando/mission-compiler.mjs

# §3 — the census, re-run from 05…§10 verbatim
cd web
find app/api -name route.ts | wc -l                                                    # 603
grep -rlE 'createAdminClient|SUPABASE_SERVICE_ROLE' app/api --include=route.ts | wc -l # 563
grep -rlE 'permissionKeys|hasPermission|requirePermission|permission_key|canManage' \
  app/api --include=route.ts | wc -l                                                   # 23
find app/adminV2 -name page.tsx | wc -l                                                # 67
find app/legacy-admin -name page.tsx | wc -l                                           # 61
grep -cE 'actionKey:' lib/admin/actions/canonicalActionRegistry.ts                     # 9
cd ..

# §4 — the catalog's split dependency, and the divergence of the two folders
sed -n '74,181p' scripts/local-dev/lib/vacilando/mission-compiler.mjs
grep -n 'ALLOWED_CHANGE_PREFIX' scripts/local-dev/lib/vacilando/acceptance.mjs
wc -l docs/platform/planning/{,vacilando-os/qa/}access-identity-v2/0[123]-*.md

# §2 — the plan's coverage artifact that closes outputs #10 and #12
grep -n '^## 23\.\|^## 3[01]\.' docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md
```

---

## 8. Provenance

- **Root** `/Users/vacilando/Code/alloy-worktrees/wt5-vacilando` — `alloy-root` reports
  `managed-worktree`, **sanctioned**, canonical `/Users/vacilando/Alloy`, base `origin/staging @ a42526613`,
  0 ahead / 0 behind. `scripts/local-dev` present.
- **Cited Vacilando source:** `mission-compiler.mjs:74-181, 183-196, 330-376, 471-511`;
  `acceptance.mjs:29-30, 56-60, 106-110`.
- **Cited corpus:** `00…§3, §6, §8`, `01…§26, §27, §29`, `03…§23, §26, §27.7`, `05…§10`, `07…§7, §8, §10`,
  `runtime-v1-closeout/access-identity-artifact-manifest.json`, `ACCESS-IDENTITY-MISSION-CLASSIFICATION.md`.
- **Mission provenance:** `msn_ee5f60faa56ac0184d` does not appear in the closeout's archived inventory,
  which is correct — that document instructs *"create Access & Identity V2 via Mission Brief — do not
  re-seed from this inventory."* This mission is that fresh brief.
- **No source, schema, migration, UI or test changed by this phase.** The only file added is this one.
