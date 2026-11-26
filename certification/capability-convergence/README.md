# Post-eradication capability convergence — certification fixtures

Closes the scenarios the representative seed cannot exercise on its own.

## Why a fixture at all

The seeded tenant (`northwind-early-learning`) configures no `participant_decisions` and no governed
`family_close`. Without this fixture the Decision and Close-family scenarios **skip** — and a skip is
not proof. It reports convergence that was never exercised, which is precisely the failure mode the
Search cert suite once shipped (8/8 PASS while the product was broken).

## Run

```bash
certification/alloy-certify up
psql "postgresql://postgres:postgres@127.0.0.1:54422/postgres" -v ON_ERROR_STOP=1 \
  -f certification/capability-convergence/01-participant-decisions.sql
certification/alloy-certify serve
( cd certification && NODE_PATH=../web/node_modules CERT_APP_URL=http://localhost:3011 \
  ../web/node_modules/.bin/playwright test -c ./playwright.config.ts --workers=1 \
  -g "every stranded capability" )
```

## Result — 6 passed, 2 skipped

| Scenario | Result | Evidence |
|---|---|---|
| A · Decision work — per-child paths inside Current Work | **PASS** | `decisionPanel: 1, decisionRows: 2` |
| B · Close family on the governed process path | **PASS** | `blocked: 1` — an enrolled child is a hard block, with its reason |
| C · Packet review — the action's event is heard | **PASS (listener half)**, skip (modal half) | a real `GET /enrollment-packets` fires on the event; before the mount nothing listened at all |
| D · Tour lifecycle | skip | `tour_summary` is not in this tenant's default Focus Panel composition — it is a configurable card. Presentation is covered by `web/tests/focusPanel/tourCardLifecycle.test.ts` |
| E · deep link to a converged card | **PASS** | `?aspect=card:current_work` → `elevated: ["current_work"]` |
| F · unconfigured tenant still gets a working panel | **PASS** | 5 default cards; every added panel self-suppresses |
| G · a legacy `open_drawer` layout cannot open anything | **PASS** | 0 adornment links on the operator surface; 0 modals |

### What the skips mean

Neither skip hides a broken path:

* **C** — the representative seed carries no packet *definition*, so it cannot carry a completed
  session, so the modal cannot open onto real data. The half that was actually broken (no listener)
  is asserted before the skip, and fails loudly if the listener regresses.
* **D** — the Tour card is not on the default composition for this tenant, which is a product fact
  rather than a defect. Its state vocabulary and terminal-state behaviour are unit-certified.

## Safety

`01-participant-decisions.sql` refuses to run unless org `northwind-early-learning` exists, and
declares `begin_lifecycle_projection_write('migration')` because `lifecycle_builder_v1` is
publication-owned. The shared hosted tenant is never touched, and nothing here closes a real family —
scenario B only reads the close preview.
