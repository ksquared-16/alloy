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

**Two real defects, both in the class a fixture cannot reach**, and both with the
same shape: *the fixture lane was tidier than any real lane.*

### 1. Three bounded components summed to more than the screen

Measured at 390×844 — a phone at **full height, no keyboard** — on a real lane
with a pending governed action:

```
interaction zone 888   in a viewport of 844
  decision bar   591   (its own max-height: min(70vh, 620px) — 70vh = 591)
  needs-you tray 138
  composer       132
Send button bottom 1083                      → 239px BELOW THE FOLD
```

Every piece was individually bounded and every bound was honoured. Nothing
bounded their **sum** against the space they had to share. The operator could not
reach Send while a governed action was pending — the exact moment the product
most needs them to.

The container now governs: the composer is the floor and never shrinks,
everything above it shares the remainder and scrolls, and the component
max-heights inside the zone are released so two authorities are not disagreeing
about the same space.

The fixture's pending governed action was a title and one sentence; the real one
renders 591px of proposal — purpose, escalation reason, six facts, two artifact
paths. The fixture now carries a fully furnished proposal, and a check asserts
the zone fits its stage rather than that Send merely happens to land on screen.

### 2. The keyboard-open lane could not shed its chrome

At 390×380 — a phone with the keyboard up — on a real lane carrying a
governed-outcome banner, the lane header (175px) and the interaction zone
(216px) together exceeded the 370px stage. The scrollable body had already
collapsed to 22px; the two fixed regions did not shrink at all, and the Send
button sat 31px below the fold.

The fixture lane had no outcome banner and a shorter header, so the same check
passed on a lane less furnished than any real one. The fixture now carries a
resolved governed action, and when the viewport is that short the lane sheds the
back row, the tabs and the identity meta — the operator is typing, and everything
that is not the instruction they are typing yields. It all returns when the
keyboard closes.

**Two harness defects, corrected rather than relaxed.**

- Home was asserted with an `=== 1` count of `[data-v-page]`, which is set on
  both the page element and `<body>` — a correctly rendering Home failed.
- "No ETA" scanned `document.innerText` and tripped over a real lane whose own
  transcript discusses ETA. The invariant is that Vacilando must not render an
  ETA *field*, not that three letters may never appear in something a human
  wrote.

A check that cannot see what it is checking, or that fails on correct output, is
worse than no check.

## Final result

**Installed-runtime acceptance: 44 checks, 44 passed, 0 failed**
(`results.json`, 2026-09-04T00:42:42Z, against `http://127.0.0.1:3030`).

Final installed toolkit: `e5d80d15edb27d07acb282d4c539326303711025`
(`origin/staging`), Gateway host pid 21569 → `toolkit/e5d80d15edb2`.

### Regression, measured under matched conditions

The accepted baseline named four failing durability suites. A fifth,
`development-provider-lifecycle`, appeared in the final run — so the baseline was
re-measured **at the pre-promotion commit `b422578b4`, on the same host, at the
same time**, rather than trusting an earlier number taken under different
conditions:

| Tree | Result | Failing suites |
|---|---|---|
| `b422578b4` (pre-promotion staging) | PASS=78 FAIL=5 | gateway-ui, provider-lifecycle, lane-provisioning, certification-fixture, director-execution-bridge |
| `e5d80d15e` (promoted) | PASS=79 FAIL=5 | *the same five* |

`development-provider-lifecycle` fails identically and reproducibly at the
baseline commit — three consecutive standalone runs — and none of the promoted
commits touch `assessProviderCapacity` or anything it reads. It is a pre-existing
staging failure whose appearance depends on host conditions, not a regression.

The promoted tree adds one passing suite (`development-gateway-ui-v2`, 43 checks)
and introduces no new failure.

A baseline number carried over from an earlier moment is not a baseline. Each
comparison in this record was measured against the other side under the same
conditions.


---

# Mobile visual correction — live acceptance (September 2026)

**77 checks, 77 passed, 0 failed** against the promoted runtime on REAL lanes.

## Promotion chain

```
authorized  52b13f7c5 + b98b9d8e3
     ↓ rebased 0694bed21 — identical 33-file / 1,686-line patch, zero drift
     ↓ PR #679  → 3540def392a8   the correction
     ↓ PR #681  → b2a3f427c7ec   open a lane on the latest exchange
     ↓ PR #682  → 4ee65145b96b   provider messages sized to content
installed   toolkit/4ee65145b96b     Gateway host pid 46443
```

## Measured on the installed runtime, real content

| | 390×844 | 320×568 |
|---|---|---|
| Lane header | **84px** | 83px |
| Current Work (real 400-word instruction) | **238px** | 211px |
| Conversation starts | 263px into the lane body | 236px |
| Lane rows visible | **16 of 18** (median 78px) | 13 of 18 |
| Idle composer field | 41px | 41px |
| Long thread opens at | **5946 of 5946** — the latest | 6746 of 6746 |
| Keyboard: Send bottom | 346 of 380 viewport | — |

Home: one identity, Needs You rows 92px, stacks to 1 column, health tiles 2
across. Catalogue: no governed payload, no "No folder", folder names unclipped.
Desktop: conversation with `You` / `Claude` bylines, inspector quiet, no ETA.

## Three defects the live gate found that the fixture could not

**1. The thread opened at the OLDEST message.** `positionThreadForEntry` queried
`.gw-msg-user` — a class that no longer existed, so the intended path was dead
code — and used `querySelector`, the FIRST match. It looked correct only because
the measured lane had a single provider entry.

**2. 146px of dead space per provider message.** `.gw-msg-assistant` carries
`min-height: min(58vh, 22rem)` from its life as a standing pane. Measured live: a
206px report occupied 352px.

**3. Two acceptance checks that could not fail.** The scroll check demanded
`scrollTop` within 24px of the absolute bottom, when the contract is that the
latest exchange is *on screen*. And "conversation begins in the first screen"
measured the first message's viewport position — which after scroll-to-latest is
**−5663**, so `< 844` passed on anything.

All three share a cause: **a fixture's threads are short and its providers
verbose in convenient ways.** That is the argument for live acceptance, and it is
why it is the gate rather than a formality.
