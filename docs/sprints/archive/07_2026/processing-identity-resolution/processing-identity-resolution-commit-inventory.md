# Processing Identity Resolution V1 — Commit Inventory

**Branch:** `claude/proc-identity-lib-normalization`  
**Certified implementation HEAD:** `4f3bbdb54fa386cbfd7652491e166fcd7c6bd5ce`  
**Inventory range:** `8d7d198fa^..4f3bbdb54`

Every commit in this range belongs to Processing Identity Resolution V1 implementation, certification, or closeout. No unrelated/stray commit appears inside the sprint range. Earlier branch history is the inherited staging baseline, not sprint-authored history.

## B1a — Canonical normalization

- `8d7d198fa` feat(identity): add canonical normalization primitives (B1a)
- `b3a724f32` refactor(identity): re-point intake normalizers through lib/identity
- `8e6677b72` test(identity): add B1a normalization parity corpus

## B0 — Tenant security prerequisites

- `d1b76128c` fix(security): scope identity record policies by organization (B0)
- `2dbe836b0` test(security): cover cross-tenant identity access boundaries (B0)

## B1b — Candidate generation and classification

- `f7be9fefa` feat(identity): add canonical candidate generation and signal model (B1b)
- `422066961` refactor(intake): delegate intake resolution to canonical matcher (B1b)
- `595c7971e` test(identity): cover candidate classification and household coherence (B1b)

## B2 — Durable facts/evidence

- `aa42ef6cc` feat(processing): add durable intake facts and evidence foundation (B2)
- `d21d1c7b7` test(processing): cover fact lineage and tenant isolation (B2)

## B3 — Resolver persistence

- `8dc4fdae6` feat(processing): persist identity resolution runs on processing cases (B3)
- `ce920d061` refactor(processing): wire record resolver seam to canonical engine (B3)
- `9b165aa2a` test(processing): cover resolver persistence and reruns (B3)

## C1 — Public-form comparison

- `4136977fa` feat(processing): run public form identity resolution in shadow mode (C1)
- `b3b22be56` test(processing): compare legacy and canonical form intake outcomes (C1)
- `f76fade54` docs(sprint): record B1b through C1 local implementation status

## D0 — Registered identity commands

- `0036122f7` feat(processing): add registered identity command contracts (D0)
- `266a0cf13` feat(processing): implement semantic identity command handlers (D0)
- `5a31a7bb5` test(processing): cover identity command safety and idempotency (D0)
- `2c9fb85b2` docs(sprint): record D0 local status and supersede D0-D3 flags

## D1 — Commit Plans and approvals

- `2d33162c9` feat(processing): add versioned commit plan tables and immutability (D1)
- `0f5d68003` feat(processing): build deterministic versioned commit plans (D1)
- `9217ca32a` feat(processing): bind approvals to immutable plan versions (D1)
- `1b9abc05a` test(processing): cover plan hashing dependencies and approval invalidation (D1)
- `c2aae6602` docs(sprint): record D1 versioned commit plans local status

## D2 — Executor

- `7aedd5a78` feat(processing): add commit attempts, exceptions, and atomic-group RPC (D2)
- `62d30f566` feat(processing): execute approved plans through registered commands (D2)
- `9709a911c` feat(processing): persist attempts and wire executor ports (D2)
- `36f55e6d7` test(processing): cover executor preflight atomicity and retries (D2)
- `90e308f0e` docs(sprint): record D2 commit executor local status

## D3 — Operator review

- `f64ca7693` feat(processing): integrate identity review and commit planning (D3)
- `8448d3162` feat(processing): add operator approval and explicit commit workflow (D3)
- `e3cbc1558` test(processing): cover review approval execution and invalidation (D3)
- `b7c0279e5` docs(sprint): record D3 operator review local status

## D4 — Manual Create Lead cutover

- `d8d1300a0` feat(processing): route manual create lead through canonical intake (D4)
- `0e5d841bd` test(processing): cover authoritative create lead workflow (D4)

## D5 / E1 — Public forms and direct-write retirement

- `4fca01f0f` feat(processing): make public forms canonical processing intake (D5)
- `961ee5763` refactor(forms): remove direct identity writes from public intake (D5/E1)
- `fafa59df3` test(processing): cover D5 public form and E1 intake boundaries
- `3cf616c42` refactor(forms): remove legacy replay flag from applyFormIntakeSafe
- `daf3cbf24` refactor(processing): remove legacy direct-write replay bypass

## Certification and hardening

- `51a2eaea3` fix(processing): align D2 RPC ON CONFLICT with customer_persons unique key
- `a6b60df98` test(processing): certify identity resolution against local postgres
- `5da250f7a` docs(processing): complete local identity resolution sprint closeout
- `5b44c475a` test(processing): certify against isolated local Supabase stack
- `2e33f86d2` fix(security): break authenticated has_org_role recursion safely
- `95316f11d` fix(processing): wire intake facts, resolutions, and D2 RPC for local cert
- `2e6e5911e` test(processing): certify create lead and public form end to end
- `e136a11b9` docs(processing): complete local sprint certification report
- `79e8fbdd3` fix(processing): harden commit executor and operator plan gates for local cert
- `26b829b24` test(processing): complete local certification integration matrix
- `6111528e1` chore(cert): add full local certification orchestrator script
- `4f3bbdb54` docs(processing): record local certification pass on isolated stack
