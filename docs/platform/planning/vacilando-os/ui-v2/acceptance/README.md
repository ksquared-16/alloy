---
owner: platform
status: sprint
last_reviewed: 2026-09-04
---

# Installed-runtime acceptance

Proof that the **running Gateway serves the promoted code** and behaves
correctly against **real runtime state** — a different and stronger claim than
the fixture certification, which proves only that the bundle is correct.

| Document | What it holds |
|---|---|
| [PRE-PROMOTION-BASELINE.md](PRE-PROMOTION-BASELINE.md) | The measured "before", recorded ahead of the merge |
| `results.json` | Machine record of every check |
| `live-*.png` | Desktop and mobile screenshots of the live Gateway |

## How to reproduce

```bash
node scripts/local-dev/apps/vacilando/certification/accept-installed-runtime.mjs \
  --base http://127.0.0.1:3030 --run <erun_id> --lane <lane_id>
```

## Why this exists separately from certification

`capture-ui-v2.mjs` serves the real bundle against **fixed fixtures**, so its
result is reproducible and does not depend on what the fleet happens to be
doing. That is the right trade for certifying a bundle, and the wrong one for
certifying a promotion: a fixture lane is **less furnished than any real lane**.

That gap is not theoretical. It is exactly what this acceptance run found.

## Promotion lineage

```
accepted candidate  172e56a8a
      ↓ governed rebase onto origin/staging
rebased head        e174db0e8   (identical 50-file / 7,526-line patch, zero drift)
      ↓ PR #670, merged by trusted host via gar_af6aa07516d418
merge commit        10c2662ce   parents b422578b4 + e174db0e8
      ↓ alloy-toolkit install origin/staging
installed toolkit   ~/.local/share/alloy/toolkit/10c2662ced41
      ↓ launchctl kickstart -k gui/<uid>/com.alloy.vacilando-gateway
running Gateway     host pid 93216 → toolkit/10c2662ced41/lib/vacilando-server.mjs --port 3030
```

## Running-process proof

Not "Git contains it" — the process resolves through `toolkit/current`, so
staging can be arbitrarily far ahead of what is served.

| | Before promotion | After |
|---|---|---|
| `/api/v2/views/home` | `unknown_v2_route` | `ok:true`, real approvals |
| `/api/v2/views/system` | `unknown_v2_route` | `ok:true`, live host telemetry |
| `/api/v2/views/activity` | `unknown_v2_route` | 200 real events |
| V2 primary navigation | absent | 4 destinations |
| server binary | `toolkit/b422578b410e` | `toolkit/10c2662ced41` |

## What acceptance found

**One real defect, in the class a fixture cannot reach.**

At 390×380 — a phone with the keyboard up — on a real lane carrying a
governed-outcome banner, the lane header (175px) and the interaction zone
(216px) together exceeded the 370px stage. The scrollable body had already
collapsed to 22px; the two fixed regions did not shrink at all, and the Send
button sat 31px below the fold.

The fixture lane had no outcome banner and a shorter header, so the same check
passed on a lane less furnished than any real one. The fixture now carries a
resolved governed action, and the fix makes the header and interaction zone
yield when the viewport is that short.

**Two harness defects, corrected rather than relaxed.**

- Home was asserted with an `=== 1` count of `[data-v-page]`, which is set on
  both the page element and `<body>` — a correctly rendering Home failed.
- "No ETA" scanned `document.innerText` and tripped over a real lane whose own
  transcript discusses ETA. The invariant is that Vacilando must not render an
  ETA *field*, not that three letters may never appear in something a human
  wrote.

A check that cannot see what it is checking, or that fails on correct output, is
worse than no check.
