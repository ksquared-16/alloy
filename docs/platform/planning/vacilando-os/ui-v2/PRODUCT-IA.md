---
owner: platform
status: sprint
last_reviewed: 2026-09-03
---

# Vacilando UI V2 — Product Information Architecture

The operator-facing shape of Vacilando. Doctrine for *how execution is operated*
lives in [Engineering Operations Center](../ENGINEERING-OPERATIONS-CENTER.md);
this document is the surface that doctrine is expressed through, and it does not
extend it.

Status vocabulary used throughout: **SHIPPED**, **REPRESENTED BUT NOT WIRED**,
**REQUIRES INSTRUMENTATION**, **DEFERRED**.

---

## 1. The five questions

Every surface exists to answer one of these, and a surface that answers none of
them does not belong in the product:

| Question | Answered by |
|---|---|
| What is running? | Home · Lanes · lane state |
| How far along is it? | Lane · Current Work · provider progress estimate |
| Does anything genuinely need me? | Needs You (Home summary, lane tray) |
| Is the environment healthy? | Home · System health · System |
| What has happened recently? | Activity (global) · lane Activity tab |

Internal mechanics remain reachable and remain complete. They are progressively
disclosed rather than removed: the Lane Inspector's folded sections, the
Diagnostics section, and the System surface hold everything the previous UI put
on the first screen.

---

## 2. Navigation

Four primary destinations, declared once in `PRIMARY_NAV`
(`apps/vacilando/public/vacilando-ui-kit.mjs`) and consumed by both form
factors, so desktop and mobile cannot offer different products.

| Destination | Hash | Purpose |
|---|---|---|
| Home | `#/home` | The command centre. Default destination. |
| Lanes | `#/lanes`, `#/lanes/:id[/:tab]` | The list, and the lane itself. |
| Activity | `#/activity` | Non-blocking history. |
| System | `#/system` | The machine underneath the work. |

Settings remains at `#/settings`, reached through account/secondary controls.

**Desktop** — a persistent left navigation above the lane list. The lane list is
a *Lanes-section* affordance and is hidden on the other three destinations,
where it navigates to nothing the operator is looking at.

**Mobile** — a bottom bar with the same four destinations and nothing else. It
is deliberately not the sidebar at a smaller size: the rail carries section
headings, the lane list and account chrome, none of which belongs under a thumb.

### Folders

Folders remain available as *optional* lane organisation. `renderLaneList()`
renders lanes directly when there is nothing to organise, and "No folder" is
never rendered as a heading. Folders are not the mental model; lanes are.

### What navigation must never carry

Context percentage, git ahead/behind, runtime slot, raw branch, provider
internals, diagnostic status. None of them changes *which lane you open*. They
live inside the lane (Inspector) or in System.

A lane row carries exactly: name, canonical state, an optional genuine Needs You
count, and recency.

**One qualifier earns a place beside the state: `read-only`.** An
observation-only lane cannot be sent an instruction, so plain "Ready" is a
promise it cannot keep. It passes the same test everything above fails — it
changes what the operator can *do*, not merely what is true underneath.

---

## 3. Home — SHIPPED (shell), mixed maturity (fields)

| Block | Contents | Status |
|---|---|---|
| Needs You | Genuine operator blockers only: governed actions awaiting authorization, runs in `NEEDS_INPUT`. Lane, request, age, Review. | SHIPPED |
| System health | Host, CPU, memory + pressure, swap, swap trajectory, disk, active/total slots, gateway, dev servers. | Mixed — see the data contract |
| Lanes | Compact operational list: name, canonical state, blocker count, recency. | SHIPPED |
| AI usage | Provider, model, runs, input/output/cache/total tokens, cost, runtime, context, retries. Windows: Today / 7 days / 30 days. | Mixed |
| AI effectiveness | Runs completed, autonomous completion %, interventions, approval interruptions, rework, average runtime, commits, tests, certifications, promotions. | REQUIRES INSTRUMENTATION |
| Recent activity | Global feed head, with *View all →*. | SHIPPED |

**Needs You is not a notification feed.** Routine status, completions and
progress are excluded by construction: `buildNeedsYou()` admits only pending
governed actions and `NEEDS_INPUT` runs.

Desktop uses the width intentionally — the operational narrative (needs you →
lanes → what just happened) runs down the wide column, with machine context
beside it. Mobile stacks the same blocks in the same order.

---

## 4. Lane

### Anatomy

```
HEADER      Lanes / Trust Runtime
            Trust Runtime   ● Working
            Claude · model · Slot 6 · Started 9:23 AM
            [Stop lane] [Lane details]
TABS        Overview · Activity · Files · Commits · Runs · Settings
OVERVIEW    CURRENT WORK  — mission, description, progress, status
            LATEST AGENT OUTPUT — clean human-readable result + artifacts
TRAY        Needs you  (only when present, anchored to the composer)
COMPOSER    instruction · attachments · provider · Send
INSPECTOR   RUN (open) · Environment · Git · Browser session · Diagnostics
```

### Tabs

| Tab | Status |
|---|---|
| Overview | SHIPPED |
| Settings | SHIPPED (rename, folder, repository, notifications) |
| Activity | REPRESENTED BUT NOT WIRED — the global feed is wired; the lane filter is not |
| Files | DEFERRED — no file-change projection exists |
| Commits | DEFERRED — commits are observed, not projected |
| Runs | DEFERRED — the run store keeps history; nothing lists it |

Unimplemented tabs render the shell and **name the owner that will fill them**
(`LANE_TAB_MATURITY`). Hiding them would hide the intended shape; faking them
would be worse.

### Current Work

Mission title, one line of description, the provider progress bar, and status.

**There is no ETA.** No estimator exists in this product, and deriving one from a
percentage would dress a guess up as a schedule. If an estimator is ever built it
gets its own field and its own maturity row.

### Needs You is an interruption state

It is rendered immediately above the composer, at the boundary where the human
already is — never as a permanent section between Current Work and the agent's
output. Multiple requests collapse to one tray with a count and
*Review requests →*; three stacked alert cards is how a lane stops being
readable. A secondary indication may also appear in the Inspector.

### Latest agent output

The provider's clean, human-readable result — the structured agent report, never
raw terminal text. Raw pane output remains available under Diagnostics.

---

## 5. Lane Inspector

`RUN` is open and shows six facts and a Stop control: state and active time,
agent/model, slot, context, started. Actions that *gate progress* (session
recovery, runtime hold/release, context refresh) stay in this always-visible
block — a control the operator cannot find is the same as no control.

Everything else is folded: **Environment** (endpoint, server health, provider
health), **Git** (branch, posture, latest commit), **Browser session** (QA
identity and sign-in recovery), **Diagnostics** (raw terminal, run status,
system activity, previous work, machine status).

The healthy default is quiet. Complexity emerges when something fails, when
something needs attention, or when the operator opens it.

---

## 6. Activity — SHIPPED

Non-blocking history. Filters: lane, type, outcome (provider is modelled and
reserved). Event kinds: Work, Governance, Git, Browser/QA, System, Provider,
Promotion, Failure.

Projected by `lib/vacilando/ui-v2-views.mjs` from the Execution Run event log,
run transitions, source-control events, admission events, resource events and
resolved governed actions. It is a projection over existing logs, not a store.

Needs You is never used for history.

---

## 7. System — SHIPPED (shell), mixed maturity

Host · Capacity · Runtime · Providers · Environment · Health history. Every
field's maturity is in the data contract.

---

## 8. Mobile

Designed, not compressed.

- Bottom navigation, same four destinations.
- Lane header: back, name, state · provider, and *Lane details* opening the
  Inspector as a drawer.
- Current Work, latest output, Needs You tray anchored to the composer.
- The composer stays reachable with the keyboard open: the interaction zone is
  pinned inside the tracked visual viewport (`--gw-vvh`), not the layout
  viewport a phone keyboard pushes off-screen.
- Tap targets clear 40px; the bottom bar clears 56px plus the home-indicator
  inset.
- No horizontal scrolling at 390px or at 320px.
- Diagnostics are not on the primary lane screen.

---

## 9. Primitives

| Primitive | Symbol | Home |
|---|---|---|
| AppShell | `renderGatewayShell` | `gateway-view.mjs` |
| PrimaryNavigation | `renderPrimaryNav` | `vacilando-ui-kit.mjs` |
| MobileNavigation | `renderMobileNav` | kit |
| PageHeader | `pageHeader` | kit |
| Surface / Card | `surface` | kit |
| LaneHeader | `renderLaneHeaderV2` | `gateway-view.mjs` |
| LaneState | `canonicalLaneWorkState` + `stateDot` | view / kit |
| Progress | `laneProgress` + `progress` | model / kit |
| NeedsYouTray | `needsYouTray`, `needsYouList` | kit |
| LaneInspector | `renderLaneInspector` | `gateway-view.mjs` |
| Metric | `metric`, `metricRow`, `meter` | kit |
| HealthState | `healthDot` | kit |
| ActivityRow | `activityRow` | kit |
| Composer | `renderComposer` | `gateway-view.mjs` (pre-existing) |
| EmptyState | `emptyState` | kit |
| DataMaturity | `field`, `MATURITY`, `DEMO` | `vacilando-ui-model.mjs` |

No duplicates were created: `canonicalLaneWorkState`, `renderComposer`,
`renderLaneList`, `renderAssistantMessage`, `renderCancelControl` and the
governed-decision renderers are the pre-existing owners and are reused as-is.
