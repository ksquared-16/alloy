# Mission Control activation (2026-07-30)

## Freeze root cause (client)

Commit `5fa156fd2` installed a `MutationObserver` on `#view` that re-entered paint
whenever loading HTML lacked `.mc-wrap`, producing an infinite main-thread
`innerHTML` loop (UI painted; clicks dead). APIs were healthy.

## Activation fix

1. Mission Control is the **default primary shell** (always on — not feature-gated).
2. **No MutationObserver.** `app.js` `render()` is the sole `#view` writer.
3. Primary nav: Missions · Timeline · Workers · Decisions · Evidence · Settings.
4. Default route `#/missions`. Empty hash and bare `#/command` redirect to Missions
   unless `?legacy=1`.
5. Stale `localStorage.vacilando_mission_control` is cleared and cannot demote MC.
6. Board/SSE polling updates chrome only while on MC routes — does not rebuild MC view.
7. Section data loads progressively after the shell is interactive.

## Compatibility

Legacy Command Center / Director remain under demoted nav links; use `?legacy=1`
for a hard refresh that preserves the legacy board.

## Client freeze fix checklist

- No MutationObserver on #view
- MC paint independent of board snap
- SSE updates chrome only on MC routes
- Stuck .ov overlays cleared on MC navigation
- schedulePaint coalesced via rAF
