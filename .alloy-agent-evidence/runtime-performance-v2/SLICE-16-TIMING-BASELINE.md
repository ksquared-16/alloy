# SLICE 16 — TIMING BASELINE (first admissible window)

Run: `erun_459975292e536ce3` · Lane: `lane_73a897409906` · Slot 1, port 3011
Candidate: `51b9e8081` · BUILD_ID `qdYy1cNvxh3Vph4lE6xYt`

**This supersedes the TIMING_BLOCKED status of `65b448f46` for the surfaces listed below.** The
experiments (S8-2, S5-4, R-005, S9-1) remain unrun and are still honestly open — §7.

## 1. Measurement configuration

| | |
|---|---|
| Server mode | **production** (`next start -H 127.0.0.1`), `nodeEnv: "production"`, `Ready in 526ms` |
| Build | `ALLOY_PROD_CERT_DIST=1 ALLOY_ROUTE_TIMING=1`, rc=0, peak 10.56 GB, distDir `.next-prodcert` |
| Route timing | `ALLOY_ROUTE_TIMING` **inlined into the Edge chunk** at build time (`.next-prodcert/server/edge/chunks/…`) — the runbook's requirement, verified in the artifact rather than assumed |
| Auth | loopback slot-1 QA session, canonical gateway path, restored 18:30:45, valid to 19:30:45 |
| Authenticated proof | `/workspace/work-unit/all` rendered **7 rows**, no `/login` redirect |
| Sampling | in-page DOM poll at **55 ms**; no precision finer than one sample is claimed anywhere |
| Runs | 5 per cell (3+1 for module cells); **run 1 discarded**; median reported with [min–max] of the kept runs |
| StrictMode | not applicable — this is a production build; `ALLOY_DEV_STRICT_MODE` is a dev-server lever and was **not** used |

**One workaround, recorded.** The installed `alloy-dev-start` appends `-H 127.0.0.1` to the *dev*
command and then overwrites `server_command` with `ALLOY_PROD_COMMAND`, so production binds the
wildcard and collides with the Tailscale Serve listener already on `:3011`
(`100.71.206.63.3011` and `fd7a:115c:a1e0::.3011` LISTEN). Resolved exactly as another lane resolved
it on 3014: `ALLOY_CONFIG_FILE` pointing at a scratch config that sources the real user config
unchanged and sets `ALLOY_PROD_COMMAND="npm run start -- -H 127.0.0.1"`. No toolkit edit, no tailnet
mutation, nothing shared mutated.

## 2. Host conditions — opening, during, closing

| | opening (18:41) | closing (19:02) |
|---|---|---|
| load 1-min | 3.91 PASS | 3.23 PASS |
| load trend | falling PASS | falling PASS |
| CPU idle | 84.57% PASS | 87.70% PASS |
| spotlight | 0.8% PASS | 0.0% PASS |
| competing node | 5 foreign, **all 0.0% CPU** | 5 foreign, all idle |
| control p50 | 8.61 ms | 5.98 ms |
| p75/p50 · max/p50 | 1.341 · 1.70 | 1.665 · 1.96 |

**No heavy foreign work ran at any point in the window** — `next build`, `playwright test` and
`vitest` were absent from the host throughout, checked at open and close. The five foreign
`next-server` processes (Access/Identity, Attendance, Enrollment participant-anchor) stayed at 0.0%
CPU, which is the condition the operator's authorization names as deciding. Dispersion is wider than
the 1.15 authorization reading, on a 6–9 ms probe whose max excursion is ~6 ms; the gate's own header
records that a min/max spread at that scale is scheduler quantisation. Recorded as environment, per
the rule that no timing is reported without it.

A production build and its residue were allowed to run **before** the window (load peaked ~7.2,
dispersion 6.17); measurement did not begin until that drained and the gate's counted criteria all
passed again. No build-time load is reported as timing evidence.

## 3. Timing table

Milestones: **T1** acknowledgement · **T2** meaningful content · **T3** usable · **T4** settled.
All values ms, median [min–max] of the kept runs.

| Surface | T1 | T2 | T3 | T4 | Class |
|---|---:|---:|---:|---:|:--:|
| Workspace (cold context) | **8** [7–8] | **2728** [2573–3019] | 8* | 2728 | **C** |
| Work Unit entry (cold context) | **7** [7–8] | **1155** [647–1233] | 1155 | **2032** [1652–2065] | **A** |
| Work Unit entry (warm) | 38 [31–50] | **1228** [1141–1424] | 1228 | **2113** [1891–2368] | **A** |
| Work View switch → Waitlist (warm) | 145 [122–168] | †  | † | **2729** [2714–2743] | **C** |
| Work View switch → Active Pipeline (warm) | 151 [142–160] | † | † | **1661** [1552–1769] | **A** |
| Focus Panel subject switch A→B (warm) | **59** [58–69] | **59** | **59** | **1549** [1534–1561] | **A** |
| Focus Panel subject revisit C→A (warm) | 60 [59–60] | 60 | 60 | 1541 [1520–1545] | **A** |
| Settings / Organization Configuration (open) | 247 | 247 | 247 | **1524** | **A** |
| Settings / Organization Configuration (warm) | 217 [149–284] | 217 | 217 | 1547 [1538–1556] | **A** |
| Work Items · Processing · Communications | — | — | — | — | **NOT MEASURED** |
| Global search → record | — | — | — | — | **NOT MEASURED** |
| Financials · Attendance | covered at card level by the subject-switch cells | | | | **A** |

\* Workspace T3 precedes T2 because the predicate used was "global search actionable", which the shell
satisfies immediately. That is a real property — the shell is actionable long before the workspace's
own content is meaningful — but it makes T3 a weaker claim than T2 here, and it is reported as such
rather than reordered.

† On a Work View switch the previous view's rows are deliberately retained while the next loads
(certified continuity from Slices 2–3), so a presence-based T2/T3 cannot distinguish the new content
from the old. Only T1 and T4 are trustworthy for these rows. The subject-switch cells do not have this
problem: they use **change** predicates keyed to the subject being left.

**Request/byte cost measured alongside:** Waitlist view 28 requests / **405 KB**; Active Pipeline 22
requests / **159 KB**; Settings 20 requests / 181 KB.

## 4. Method corrections made during the window, stated plainly

Two first-pass results were wrong and were fixed before anything was reported:

1. **Subject switch first read T1=T2=T3=1 ms.** An artifact: the prior subject's row, identity and
   cards were all still on screen, so every presence predicate was already true at the first sample.
   Re-measured with change predicates (`active !== previous`, `bodySubj === active && !== previous`).
2. **The first subject harness never performed the switch** — it sampled a settled surface, so every
   milestone read null and T4 was just the settle loop. Fixed by sampling concurrently with the action.

The corrected numbers are the ones in §3. Nothing from the first pass is reported.

## 5. Diagnoses

**Workspace — C (legitimate wait, weak transition).** The app shell paints in **8 ms** and global
search is usable immediately, but the workspace's own content — org header, sections, KPIs — does not
arrive for **~2.73 s**. The work is real (business processes, KPIs, site/access context). What the
operator sees in between is a shell with no workspace content. *Recommended treatment:* shell-first
reveal is already happening; add **reserved geometry** for the section grid and **immediate identity**
(org name in the header before the sections resolve), both existing Alloy primitives. *What not to do:*
a spinner or a full-page skeleton would replace an already-painted, already-usable shell with a
loading state — strictly worse.

**Work Unit entry — A.** T2 ~1.2 s, fully settled ~2.0–2.1 s, T1 in single-digit ms. This is the most
important journey in the programme and it is fast enough. One observation, not a defect: **warm is not
faster than cold** (1228 ms vs 1155 ms, overlapping ranges). Whatever the second visit reuses, it does
not shorten time-to-rows. Worth a future question; not worth a repair on this evidence.

**Work View switch — C for Waitlist, A for Active Pipeline.** The difference is not presentation, it is
payload: Waitlist settles in **2.73 s** on **405 KB / 28 requests**, Active Pipeline in **1.66 s** on
**159 KB / 22 requests**. The transition itself is good — the prior view is retained, T1 is ~150 ms,
and no blank frame appears. So the Waitlist cost is underlying work (2.5× the bytes), and the honest
classification is *legitimate wait with a payload question behind it*, not a transition defect.

**Focus Panel subject switch — A. Leave it alone.** 59–60 ms from keypress to the new subject's
identity, cards and an actionable command — with **zero blank frames** and the card count never
dropping below 6 in any sampled frame, on either A→B or the C→A revisit. Settlement completes at
~1.54 s. This is the surface Slices 1–14 rebuilt, and it is now the fastest thing measured. No product
work.

**Settings / Organization Configuration — A.** 217–247 ms to content, ~1.53 s settled, 181 KB.
Configuration does **not** have materially different loading characteristics from operator runtime on
this evidence — it is comparable to a Work View switch and faster than Workspace.

**Financials and Attendance — A, at card level.** Both ride the Focus Panel subject switch, which never
dropped a card or showed a blank frame across 20 sampled switches. The Slice 4 and Slice 14 geometry
repairs hold under production timing.

## 6. What was not measured, and why

* **Work Items, Processing, Communications.** Not routes: `/workspace/work-items`, `/workspace/processing`
  and `/workspace/communications` all return **404** on this build. They are in-shell tabs, and locating
  their triggers reliably is exactly the work the "workspace shell renders all tabs" lesson warns against
  guessing at. Deferred rather than approximated.
* **Global search → record.** Time; the session window closed first.
* **Attendance as its own surface.** Still `NOT_MEASURABLE — PRODUCT NAVIGATION OWNER`; unchanged.
* **Reserved-geometry mounted window.** Still needs a participant-scoping surface; none appeared naturally
  and none was fabricated.

## 7. The four experiments — NOT RUN this window

S8-2/R-018, S5-4, R-005 and S9-1 all remain **OPEN**. Each needs an experimental switch *plus its own
production rebuild* (the flag must be inlined at build time) plus matched journeys; four build-and-measure
cycles do not fit inside one 60-minute authenticated session alongside the matrix. Nothing about them was
guessed at, and no partial result is claimed. S9-1 specifically was not observed because no
membership-changing mutation was run — the instruction permits observing it opportunistically during the
S8-2 A/B, and that A/B did not run.

**They are now cheap to run.** The production build, the loopback session path, the config workaround and
the harness all exist; a follow-up window needs only: build with the switch → restart → matched cells.

## 8. Consolidated programme status

**CLOSED** — runtime ownership/correctness repairs · Focus Panel stable lifecycle · latest-selection-wins ·
monotonic subject identity · Financials duplicate + geometry · provisioning inflight convergence · S8-3
eligible-child convergence · perceived-performance continuity · configuration freshness · direct payload
convergence (~126 KB → ~72 KB warm) · mutation fan-out certification · S4-1 reserved geometry · D-2
(StrictMode artifact) · **timing baseline for 7 surfaces (this slice)**.

**OPEN — IMPLEMENTABLE** — none.

**OPEN — DECISION / EXPERIMENT** — S8-2/R-018 · S5-4 · R-005 · S9-1 · F-2 · S3-4 (monitor).

**OPEN — MEASUREMENT** — Work Items, Processing, Communications (in-shell tabs) · global search → record ·
reserved-geometry mounted window.

**NEW this slice** — Workspace is the one Class C surface with a presentation fix available. Waitlist Work
View costs 2.5× Active Pipeline's bytes. Warm Work Unit entry is not faster than cold. The production
`alloy-dev-start` wildcard-bind defect (toolkit-owned, worked around without mutation).

**HOST** — qualified under the operator's stated rule for the whole window; all counted criteria except the
foreign-process count passed at open and close, and no heavy foreign work ran.
