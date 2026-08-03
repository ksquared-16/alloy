# P0 — Vacilando interactivity regression (2026-07-30)

## Symptom

Live Vacilando frozen: UI may paint, but clicks/navigation do not respond.

## Root cause

**Commit:** `5fa156fd2` (`feat(vacilando): Mission Control UI — Missions-first nav + Brief intake`)

**File:** `scripts/local-dev/apps/vacilando/public/mission-control.js`

**Mechanism:** A `MutationObserver` on `#view` called `paintV2()` whenever the DOM lacked `.mc-wrap` / `.kickoff-card`. Loading states rendered as bare `.empty` (no `.mc-wrap`), so each paint re-triggered the observer → infinite main-thread `innerHTML` rewrite loop. Pointer events never ran.

Secondary contributors in the same commit:

- Default route forced to `#/missions`
- Dual render paths (`app.js` `render` + `paintV2` + observer)
- `V2.install()` rewriting the entire nav on load

**Not the cause:** `640fdabe4` V2 runtime APIs alone (`/api/v2/*` is fast; health ~14ms, missions ~67ms, state ~338ms in recovery timing).

## Fix

1. Restore legacy shell as default (`index.html` + `app.js` routing from `640fdabe4`).
2. Do **not** load Mission Control as the primary nav.
3. Gate `mission-control.js` behind `localStorage.vacilando_mission_control=1` or `?mc=1`.
4. Remove the MutationObserver entirely from the gated script.
5. Preserve all `/api/v2/*` runtime modules and persisted mission data.

## Re-enable Mission Control (after validation)

```js
localStorage.setItem("vacilando_mission_control", "1");
location.href = "/?mc=1#/missions";
```

Disable:

```js
localStorage.removeItem("vacilando_mission_control");
location.href = "/#/command";
```

## Status

**Superseded 2026-07-30:** Mission Control is again the **default primary shell** after the MutationObserver freeze was removed and ownership cutover completed. See `MISSION-CONTROL-ACTIVATION.md`.

V2 **runtime** remains enabled. Legacy Command Center is demoted to `?legacy=1` compatibility routes.
