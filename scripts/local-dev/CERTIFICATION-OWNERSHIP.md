# Certification database ownership

`exclusive-certification-db` is an **enforced** permit. Destructive toolkit commands
refuse to run when another worker owns the certification database.

It was previously advisory. During one Interactive Tour certification run the tenant,
an unmerged migration, deterministic fixtures, scoped credentials and browser evidence
were destroyed three times — the last time while the permit was held. Ownership that
only works when everyone remembers to ask is not ownership.

## The contract

```
permit  = who may DESTROY the certification database
lease   = who is USING the shared stack
```

A lease says *"I am here"*. A permit says *"I own this, and destroying it is mine to
do."* **Holding a stack lease never authorises a destructive operation.** The two
records do not disagree because there is only one ownership record: the
`alloy-compute` permit store. `lib/cert-ownership.sh` reads it and never keeps a copy.

## What the guard blocks

Every destructive entry point calls `alloy_cert_guard` **before any side effect**.

| Operation | With a live owner (not you) | With no owner |
|---|---|---|
| `destroy-db` — database reset, schema replacement | refused | **refused** — permit required |
| `replay` — destructive migration replay | refused | **refused** — permit required |
| `seed` — tenant seed / fixture replacement | refused | **refused** — permit required |
| `wipe-tenant` — zero-survivor or promotion cleanup | refused | **refused** — permit required |
| `volumes` — volume discard or replacement | refused | **refused** — permit required |
| `stop-stack` — stopping the shared stack | refused | allowed (ordinary housekeeping) |
| `reap` — generic cleanup sweeps | refused | allowed |

The owner may do all of them, including stopping the stack during its own cleanup.

**Promotion and zero-survivor workflows are not exempt.** A promotion worker may not
wipe the tenant because its own workflow expects zero survivors. It acquires the permit
or waits.

## Compatibility policy

**No co-tenancy during exclusive certification.** A compatible read-only class was
considered and deliberately not shipped: safe non-destructive access could not be
proven quickly, and correctness matters more than utilisation here. Other workers may
still hold ordinary stack leases, but no destructive operation of any kind is available
to them while an owner is live.

## Using it

```bash
alloy-compute acquire exclusive-certification-db --reason "what you are certifying"
# ... reset, replay, seed, certify, browser QA ...
alloy-compute release exclusive-certification-db
```

`--wait` queues instead of failing. `alloy-compute status` shows the owner, its
worktree, permit age, purpose, whether its process is still alive, and any waiters —
so a blocked worker can see *why*.

## Recovery

Ownership recovery is **evidence-based, never time-based alone**. An owner mid browser
certification can be quiet for a long time and must not be reaped for it.

```bash
alloy-compute recover exclusive-certification-db
```

It refuses while the owner's anchor process is alive, refuses a permit younger than
`ALLOY_COMPUTE_MIN_RECLAIM_AGE` (default 900s), explains why ownership is believed
stale, records the recovery to `recovery.log`, and releases ownership atomically. **It
never stops or resets the stack** — ownership is resolved first, and the incoming owner
decides what to do next.

## Prohibited

Do not operate on the shared certification stack or database outside these commands.
Direct `supabase db reset`, `supabase stop`, `docker rm` against the cert project, or
hand-written SQL that drops and reseeds the tenant all bypass the guard. If you find a
path that reaches the database without passing `alloy_cert_guard`, that is a defect —
report it rather than using it.

The one sanctioned override is deliberately loud and is never set by any toolkit
command:

```bash
ALLOY_CERT_OWNERSHIP_OVERRIDE=i-accept-destroying-another-workers-certification
```

## Tests

`tests/test-cert-ownership.sh` — 24 checks, including a reproduction of the original
failure: worker A acquires and seeds, worker B attempts promotion cleanup and reset,
the toolkit refuses, and A's tenant and ownership survive. It runs against isolated
state with fake `supabase`/`docker` binaries, so the suite cannot touch a real stack.
