# Browser QA — BOS Command Runtime Convergence (promotion pass)

> Mission closed. Canonical architecture:  
> [`docs/platform/milestones/bos-command-runtime-convergence-closeout.md`](../../docs/platform/milestones/bos-command-runtime-convergence-closeout.md)

Mission: `msn_188e8bea6fb6de28dd21`  
Date: 2026-07-28  
HEAD at classification: `15e936584` (evidence commit follows)  
Worktree: `wt1-commands-system-inventory` / port **3011**

## Classification

**ENVIRONMENT-BLOCKED** — interactive browser certification could not complete.

No product or Command Runtime defect was observed as the cause. Automated shared-bridge proofs remain the promotion evidence for mutation / relationship / confirmation / authority families.

---

## Stabilization attempted (Step 1)

| Action | Result |
|--------|--------|
| `alloy-worker-pause` slots 2, 3, 4 | Applied; slots 3/4 stayed paused |
| Slot 2 | **Repeatedly resumed by another agent** (next-server reappeared within minutes after pause) |
| `alloy-worker-doctor 1 --recover` | Cleared stale PID files |
| Removed proven-stale empty `.next/dev/lock` | Done |
| `alloy-dev-start wt1-commands-system-inventory` | Reaches **Ready** + `GET /login 200` |
| Stability | Listener dies within seconds–tens of seconds after Ready under memory pressure |

### Exact env evidence

See `qa/missions/commands-bos-browser-env-block-msn_188e8bea6fb6de28dd21.txt`.

Observed peaks:

- Free Mach pages ~**3547–5982** (~55–90 MiB) while wt2 Next was running concurrently.
- After pause of wt2: free pages briefly ~**136k–185k**, enough for one Ready+200 cycle.
- Same process then exits with **no product error** in the Next log (log ends at Ready / login 200; next line is a new start or silence).
- Cursor IDE browser navigations to `http://127.0.0.1:3011/*` returned `chrome-error://chromewebdata/` whenever the listener was down (and could not complete an authenticated session while it flickered).

Screenshots: **none captured** — no stable authenticated AdminV2 surface was reachable long enough to exercise BOS.

---

## Narrow checklist status

| Family | Planned | Result |
|--------|---------|--------|
| Create Lead regression | Basic only | **Not re-run in browser** (owner-accepted; env blocked) |
| Mutation `update_lead_status` | Discover → input → confirm once → reload | **Environment-blocked** |
| Relationship `add_parent_guardian` | Discover → inputs → confirm once → reload | **Environment-blocked** |
| Confirmation `cancel_tour` | Preview → confirm → cancel; reject missing token | **Environment-blocked** (automated adapter test covers missing token + single bridge invoke) |
| Authority rejection | Unselected Command not inventable | **Environment-blocked** in UI; **automated** slash catalog tests prove ineligible + fail-closed |

Operator checklist (unchanged) remains in prior section of this mission’s QA notes for a healthy :3011.

---

## Automated promotion evidence (retained)

Focused suite (43/43):

- `tests/bos/commandSession/representativeBosAdapters.test.ts` — exactly-once bridge; no private mutation/relationship/tour cancel URLs
- `tests/bos/commandSession/slash/queryBosSlashCatalog.test.ts` — process gate / unselected ineligible
- `tests/bos/commandSession/bosCommandSessionHostDispatch.test.ts`
- `tests/platform/commands/executePlatformCommandViaActionsApi.test.ts`
- `tests/lifecycle/processRuntimeCommandConsumption.test.ts`
- `tests/platform/commands/commandRuntimeExecutionGate.test.ts`
- `tests/platform/commands/prepareCommandInvocation.test.ts`

Commands runtime folder: **250 passed**, **2 failed** in unrelated `createLeadSuccessRefresh.test.ts` (see promotion report).

Production `npm run typecheck`: **exit 0**.

---

## Defects found

**None** in BOS Command Runtime Convergence product code during this pass.

No code fixes applied. No adapter expansion.
