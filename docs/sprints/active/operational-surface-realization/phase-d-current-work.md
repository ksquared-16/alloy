# Phase D — Current Work stability

## Observation
Focus Panel for Kurzman Family flipped between:
1. Contact Family · requirements · 20% progress · Record outcome / Open workspace
2. “No current work configured”

## Trace owners (unchanged by this sprint’s header work)
selected row seed → selected record id → Focus Panel VM → BP/stage resolution → Current Work projection → card

First-pass commits touched only:
- `WorkUnitSurface` density prop
- `WorkUnitHeader` / `WorkspaceHeader` presentation
- Queue compact variant matching / publish validation
- Overview width primitives

**No Focus Panel Current Work VM, settlement, or projection files were modified.**

## Conclusion
**Not a first-pass regression.** Most likely causes (in order):
1. Different selected records / stages / Work Views between screenshots
2. Warm settlement replacing an earlier payload for a different subject (pre-existing race risk — not introduced here)
3. Stage/config with no Current Work projection vs one with Contact Family

## Action
No code patch in this follow-up. If a stale-payload race is later reproduced with matching `selectedRecordId` + newer vs older Current Work timestamps, fix under Focus Panel settlement ownership with a regression test — out of scope for header/sizing/Children contract work.
