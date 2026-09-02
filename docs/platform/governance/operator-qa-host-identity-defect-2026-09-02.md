# Operator QA host-identity defect — `localhost` is not an address, it is a question

**Found:** 2026-09-02, Surfaces lane `lane_faacca6079ad`, slot 6
**Class:** Vacilando infrastructure / operator QA ergonomics
**Status:** open — separate follow-up. Not a Surface layout defect and not fixed by the Surface layout work.

## What happened

Six consecutive rounds of Surface Builder QA failed in a way neither side could
reproduce. The lane's scripted gestures passed; the operator's own gestures
failed; and the drag recorder — built specifically to capture the operator's
gesture — never received a single human trace, across every round.

Every hypothesis during those rounds concerned the drag: snap bands, grab offset,
reference frames, hysteresis, the placement solver. Each was investigated,
several were genuinely improved, and the operator's QA still failed. The
assumption nobody tested was the one underneath all of them: **that the
operator's `localhost:3016` and the lane's `localhost:3016` were the same
process.**

They were not. The operator works from a MacBook connected to the Mac mini that
hosts the lane. `localhost` resolves on the machine the *browser* runs on, so the
operator's browser was reaching a different server, serving a different checkout.
No fix shipped in this lane had ever appeared on the operator's screen.

## The evidence that settled it

The lane's slot-6 dev server binds two addresses:

```
- Local:    http://localhost:3016
- Network:  http://192.168.4.31:3016
```

Three Next dev servers run on the mini concurrently (slots 4, 5, 6). Port 3016
was confirmed to be this worktree by a route that exists only here — it answered
`200` on 3016 and `404` on 3014/3015.

The decisive counter is the trace sink: it had received **19 POSTs and written 18
files, every one of them lane-generated.** Zero human traces, ever. A stale
browser tab explains one round, perhaps two. It does not survive a hard reload,
and it does not explain six.

## Why this class of failure is expensive

It is invisible from both ends. The operator sees a working Surface Builder at a
plausible URL. The lane sees its own code, its own tests, and its own passing
browser runs. Both parties are correct about their own machine and wrong about
each other's, and nothing in the workflow surfaces the disagreement. The cost
here was six QA rounds and an architecture rewrite pursued against symptoms that
were never reproducible in the first place.

It is also the same shape as the failure `agent-repo-boundaries.md` already
warns about — "being in the right repository is not being on the right base."
This is its runtime twin: **being at the right URL is not being on the right
host.**

## Follow-up

1. **Operator QA links must name their execution host.** A lane that hands the
   operator `localhost:<slot>` is handing them a URL whose meaning depends on
   which machine reads it. The lane knows its own hostname and LAN address; the
   link it presents should carry them.
2. **Expose a build-identity probe as a platform affordance**, not a per-lane
   improvisation. `web/app/api/dev/build-identity/route.ts` was added in this
   lane and answers host, worktree, branch and commit for whichever server
   actually served the tab. Something equivalent belongs in the toolkit, so any
   lane can settle "which build am I looking at?" in one request.
3. **Consider making the mismatch self-announcing.** A dev-only badge that shows
   the serving host when it is not the machine the browser is on would have made
   this visible in the first round rather than the seventh.

## Not in scope here

The Surface layout work in this lane is unaffected by this finding and does not
depend on it. This document exists so the infrastructure defect is not absorbed
into — and forgotten alongside — a UI patch.
