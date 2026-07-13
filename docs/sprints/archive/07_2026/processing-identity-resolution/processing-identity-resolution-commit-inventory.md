# Processing Identity Resolution — Commit Inventory

**Status:** Implemented locally · Locally certified · Awaiting staging reconciliation · Not promoted · Not deployed.

**Branch:** `claude/proc-identity-lib-normalization`

**Certified HEAD:** `6d8851f1c416516d598ce94a28e1bf547bc98170`

**Merge-base vs origin/staging:** `1a4a85c98539289d3dc21a23465f9b5bc7f7c681`

**Commit count (sprint range):** 65

Grouped by phase (heuristic from commit messages; each commit listed once).

## B1a (1)

- `8e6677b72 test(identity): add B1a normalization parity corpus`

## B0 (1)

- `2dbe836b0 test(security): cover cross-tenant identity access boundaries (B0)`

## B1b (3)

- `595c7971e test(identity): cover candidate classification and household coherence (B1b)`
- `422066961 refactor(intake): delegate intake resolution to canonical matcher (B1b)`
- `f7be9fefa feat(identity): add canonical candidate generation and signal model (B1b)`

## B2 (1)

- `aa42ef6cc feat(processing): add durable intake facts and evidence foundation (B2)`

## B3 (3)

- `9b165aa2a test(processing): cover resolver persistence and reruns (B3)`
- `8dc4fdae6 feat(processing): persist identity resolution runs on processing cases (B3)`
- `b3a724f32 refactor(identity): re-point intake normalizers through lib/identity`

## C1 (1)

- `b3b22be56 test(processing): compare legacy and canonical form intake outcomes (C1)`

## D0 (4)

- `5a31a7bb5 test(processing): cover identity command safety and idempotency (D0)`
- `266a0cf13 feat(processing): implement semantic identity command handlers (D0)`
- `0036122f7 feat(processing): add registered identity command contracts (D0)`
- `ce920d061 refactor(processing): wire record resolver seam to canonical engine (B3)`

## D1 (5)

- `1b9abc05a test(processing): cover plan hashing dependencies and approval invalidation (D1)`
- `9217ca32a feat(processing): bind approvals to immutable plan versions (D1)`
- `0f5d68003 feat(processing): build deterministic versioned commit plans (D1)`
- `d1b76128c fix(security): scope identity record policies by organization (B0)`
- `8d7d198fa feat(identity): add canonical normalization primitives (B1a)`

## D2 (5)

- `2e33f86d2 fix(security): break authenticated has_org_role recursion safely`
- `51a2eaea3 fix(processing): align D2 RPC ON CONFLICT with customer_persons unique key`
- `36f55e6d7 test(processing): cover executor preflight atomicity and retries (D2)`
- `9709a911c feat(processing): persist attempts and wire executor ports (D2)`
- `d21d1c7b7 test(processing): cover fact lineage and tenant isolation (B2)`

## D3 (4)

- `e3cbc1558 test(processing): cover review approval execution and invalidation (D3)`
- `8448d3162 feat(processing): add operator approval and explicit commit workflow (D3)`
- `62d30f566 feat(processing): execute approved plans through registered commands (D2)`
- `2d33162c9 feat(processing): add versioned commit plan tables and immutability (D1)`

## D4 (2)

- `0e5d841bd test(processing): cover authoritative create lead workflow (D4)`
- `d8d1300a0 feat(processing): route manual create lead through canonical intake (D4)`

## D5/E1 (7)

- `daf3cbf24 refactor(processing): remove legacy direct-write replay bypass`
- `3cf616c42 refactor(forms): remove legacy replay flag from applyFormIntakeSafe`
- `fafa59df3 test(processing): cover D5 public form and E1 intake boundaries`
- `961ee5763 refactor(forms): remove direct identity writes from public intake (D5/E1)`
- `4fca01f0f feat(processing): make public forms canonical processing intake (D5)`
- `7aedd5a78 feat(processing): add commit attempts, exceptions, and atomic-group RPC (D2)`
- `4136977fa feat(processing): run public form identity resolution in shadow mode (C1)`

## Certification (7)

- `6111528e1 chore(cert): add full local certification orchestrator script`
- `26b829b24 test(processing): complete local certification integration matrix`
- `79e8fbdd3 fix(processing): harden commit executor and operator plan gates for local cert`
- `2e6e5911e test(processing): certify create lead and public form end to end`
- `95316f11d fix(processing): wire intake facts, resolutions, and D2 RPC for local cert`
- `5b44c475a test(processing): certify against isolated local Supabase stack`
- `a6b60df98 test(processing): certify identity resolution against local postgres`

## Identity-review fix (6)

- `ad2b4377c docs(processing): freeze identity-review authority and eligibility states`
- `7b96cc0e9 test(processing): cover blocking identity review and duplicate prevention`
- `1ab1ec3d7 feat(processing): expose candidate decisions and create-new overrides`
- `5d916a759 fix(processing): block plans with unresolved identity subjects`
- `5e84f2630 fix(identity): require operator resolution for plausible child matches`
- `f64ca7693 feat(processing): integrate identity review and commit planning (D3)`

## Closeout/docs (15+)

- `6d8851f1c docs(processing): prepare promotion and rollback artifacts`
- `95aab1853 docs(processing): finalize identity resolution sprint documentation`
- `19c0fbf11 docs(processing): align canonical docs with closeout audit`
- `b1c37cb9f docs(processing): clarify historical audit wording`
- `3ec78356e chore(processing): complete sprint closeout`
- `986aeaf3d docs(processing): prepare promotion and rollback artifacts`
- `790595fc1 docs(processing): finalize identity resolution sprint documentation`
- `4f3bbdb54 docs(processing): record local certification pass on isolated stack`
- `e136a11b9 docs(processing): complete local sprint certification report`
- `5da250f7a docs(processing): complete local identity resolution sprint closeout`
- `b7c0279e5 docs(sprint): record D3 operator review local status`
- `90e308f0e docs(sprint): record D2 commit executor local status`
- `c2aae6602 docs(sprint): record D1 versioned commit plans local status`
- `2c9fb85b2 docs(sprint): record D0 local status and supersede D0-D3 flags`
- `f76fade54 docs(sprint): record B1b through C1 local implementation status`
