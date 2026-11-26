/**
 * Repo-side entry point for the migration parity verdict.
 *
 * THE IMPLEMENTATION LIVES IN THE TOOLKIT, deliberately. The installed runtime
 * ships `scripts/local-dev` and nothing else — INSTALL-MANIFEST says
 * `source_subdir=scripts/local-dev` — so a module the Gateway must import at
 * merge time cannot live under `supabase/`. It would resolve in the repository,
 * pass its tests, and be absent on the host that actually runs the gate.
 *
 * This re-export keeps the original repo-side path working for scripts and
 * humans without creating a second copy of the logic to drift.
 */
export * from "../../scripts/local-dev/lib/vacilando/migration-parity.mjs";
