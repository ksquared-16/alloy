/**
 * WHERE psql ACTUALLY IS, RATHER THAN WHERE PATH SAYS IT SHOULD BE.
 *
 * `trusted-host-run-sql.sh` already learned this and wrote it down: Homebrew's
 * libpq is KEG-ONLY. It installs a working psql and deliberately does not link
 * it into /opt/homebrew/bin, because it conflicts with a full postgresql
 * formula — so `brew install libpq` leaves a host where psql works perfectly and
 * `command -v psql` finds nothing. The Gateway's environment is one of those.
 *
 * The seed runner spawned a bare "psql" anyway, and the first hosted execution
 * of the governed fixture died as:
 *
 *     organization_probe_failed: spawnSync psql ENOENT
 *
 * which names the probe and not the cause. That is the same sentence the shell
 * child's comment warns about, one layer up — the fix was one line and the
 * symptom pointed somewhere else.
 *
 * Force-linking is not the answer: it changes host-global state and can break a
 * postgresql install other things depend on. So the known keg-only locations are
 * consulted directly, in the same order, and a host with no client at all gets a
 * NAMED refusal instead of a generic failure.
 *
 * Pure and injectable: `env` and `exists` are parameters so the resolution order
 * can be proven without a host that happens to be arranged correctly.
 */
import { existsSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";

/** Same list, same order, as the trusted-host SQL child. */
export const KEG_ONLY_CANDIDATES = Object.freeze([
  "/opt/homebrew/opt/libpq/bin/psql",
  "/usr/local/opt/libpq/bin/psql",
  "/opt/homebrew/bin/psql",
  "/usr/local/bin/psql",
  "/Applications/Postgres.app/Contents/Versions/latest/bin/psql",
]);

const executable = (p) => {
  try { return statSync(p).isFile(); } catch { return false; }
};

/**
 * @returns {{ path: string, source: "declared"|"path"|"keg_only" } | null}
 */
export function resolvePostgresClient({ env = process.env, exists = executable } = {}) {
  // An explicit declaration wins: a host that knows where its client is should
  // not have to match somebody's list.
  const declared = String(env.PSQL_BIN || "").trim();
  if (declared && exists(declared)) return { path: declared, source: "declared" };

  for (const dir of String(env.PATH || "").split(delimiter).filter(Boolean)) {
    const candidate = join(dir, "psql");
    if (exists(candidate)) return { path: candidate, source: "path" };
  }

  for (const candidate of KEG_ONLY_CANDIDATES) {
    if (exists(candidate)) return { path: candidate, source: "keg_only" };
  }
  return null;
}

/** The remedy, as a sentence a human can act on. Never a credential. */
export const POSTGRES_CLIENT_MISSING_DETAIL =
  "no PostgreSQL client on PATH or at the known keg-only locations; "
  + "install with `brew install libpq` (keg-only — this runner resolves it directly), "
  + "or declare PSQL_BIN";

export { existsSync };
