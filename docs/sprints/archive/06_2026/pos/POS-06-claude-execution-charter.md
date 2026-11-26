# POS-06 — Claude Execution Charter

> **Status:** Planning artifact (execution doctrine v1, draft). **Not implementation.**
> This defines *how development will happen after planning is accepted.* It governs the later build; it does not authorize any build now.
> Inherits from **POS-01 … POS-05**. Branch: `pos-planning-v1`.

## Purpose

Freeze the operating agreement for how Claude (in Cowork) executes POS development **after** the planning package is accepted at the Doctrine and UX Gates. The goal: move fast package-by-package without stopping after every package, while keeping doctrine frozen and surfacing real blockers early.

## Authority and repo rules (carried from kickoff)

- Work in **`~/Alloy-Claude`**. Do **not** modify `~/Alloy`.
- Branch from latest **`staging`**. Planning branch: **`pos-planning-v1`**.
- Before any work session: confirm repo path and current branch, fetch latest staging, create/refresh the working branch, and report the baseline commit.
- During planning: no production code, no migrations, no schema, no API design.
- **Sandbox reality (noted June 2026):** in the Cowork sandbox, network fetch to the Git remote over SSH is blocked, and the repo mount allows file rename but not unlink (git lock cleanup fails and must be cleared with a rename). Real `git fetch`/`push`, full `vitest`, `npm run build`, and DB reset may need to run **outside** Claude's environment. Treat these as host-side steps when the sandbox cannot reach the toolchain.

## Branch model

- One planning branch (`pos-planning-v1`) holds POS-01…06 + README.
- Implementation begins on fresh branches cut from latest `staging` **after** the Doctrine and UX Gates pass.
- Each execution package gets a focused branch (or a stacked branch off the prior accepted package), named for the package and gate it serves.
- No implementation branch merges to `staging` except at a **named gate** with explicit human acceptance.

## Package-by-package execution loop

After planning is accepted, Claude executes **package-by-package without stopping after every package**:

1. **Build** the package.
2. **Run the substitute / self-verification gate** for that package (Claude-runnable checks: type-checks, targeted unit tests, lint, render/diff review, screenshot review where applicable).
3. If it **fails**, fix.
4. **Rerun** the substitute gate.
5. If the **same failure survives 2 repair attempts**, **pause and escalate** with a precise blocker report.
6. If **green**, **continue to the next package**.
7. **Report only at named gates** unless blocked.

This is the default cadence: keep moving while green; stop only at gates or genuine blockers.

## Substitute gate vs. real gate

- **Substitute gate (per package):** the strongest verification Claude can run *inside* its environment — fast, automated, self-checked. It is how Claude earns the right to continue to the next package without human sign-off.
- **Real gate (named gates only):** human acceptance, plus host-side runs of the real toolchain where the sandbox can't (full `vitest`, `npm run build`, DB reset). The substitute gate is a proxy for confidence between real gates; it does not replace them.

## Two-failed-repair rule

For any failing check: Claude attempts a fix, reruns, and if the **same failure persists after 2 repair attempts**, it **stops and escalates** rather than thrashing. The escalation states: what failed, the 2 attempts made, the suspected cause, and the options. Claude does not loop indefinitely or silently work around doctrine to make a check pass.

## Reporting discipline

- **Report at named gates**, and **when blocked**. Not after every package.
- Gate reports state: packages completed since the last gate, substitute-gate results, what needs a real gate / host-side run, open questions, and the recommended decision.
- Between gates, the task list reflects progress; prose reports are reserved for gates and blockers.

## No doctrine drift during implementation

- POS-01…05 are **frozen**. Implementation **elaborates** them; it does not **contradict** them.
- If implementation reveals that doctrine must change, Claude **escalates** and does not change doctrine unilaterally. Doctrine changes are re-accepted at the **Doctrine Gate** before dependent work proceeds.
- "No intake as product concept," "records own truth," "operator approval," and "BOS in the right rail" are the doctrine lines most likely to be eroded by implementation convenience — they are explicitly protected.

## Named gates

| Gate | What is accepted | Real-gate work |
|------|------------------|----------------|
| **Doctrine Gate** | POS-01…03, POS-05 taxonomy, POS-06 — planning docs accepted | Human review of doctrine |
| **UX Gate** | POS-04 UX vision accepted | Human review of screens |
| **Foundation Gate** | Schema / types / foundation accepted | Host-side: migrations, `npm run build`, type-check, DB reset |
| **Workspace Gate** | Processing workspace accepted | Host-side: build + targeted E2E |
| **Review Gate** | Review / linkage accepted | Host-side: build + tests |
| **BOS Gate** | BOS integration accepted | Host-side: build + tests + safety review |
| **Final QA Gate** | Full program ready for a real gate | Host-side: full `vitest`, `npm run build`, DB reset, regression |

Doctrine and UX Gates come first and block everything downstream. Foundation precedes Workspace; Workspace precedes Review; Review precedes BOS; BOS precedes Final QA.

## Execution loop (canonical statement)

```
for each package in accepted plan order:
    build(package)
    result = substitute_gate(package)
    attempts = 0
    while result == FAIL and attempts < 2:
        fix(); result = substitute_gate(package); attempts += 1
    if result == FAIL:        # same failure survived 2 repairs
        pause(); escalate(blocker_report); break
    if at_named_gate(package):
        report(gate_report); await human + host-side real gate
    # else: continue silently to next package
```

## What this charter is not

- Not a schedule or estimate.
- Not authorization to start building — building starts only after the Doctrine and UX Gates pass.
- Not a license to run destructive host operations from inside the sandbox; those are flagged for host-side execution.
