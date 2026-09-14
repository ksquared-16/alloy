/**
 * WHAT A HOSTED CERTIFICATION FIXTURE IS ALLOWED TO DESTROY.
 *
 * `certification/fixtures/financials-demo-tenant.sql` was written for the shared
 * LOCAL cert stack, where the tenant is disposable and other sessions reset it
 * without warning. Six of its subsidy teardown statements were therefore scoped
 * `where org_id = :'org'` — every subsidy claim, remittance, authorization and
 * variance in the tenant, whoever created them — executed with
 * `session_replication_role = replica`, which suspends the very triggers that
 * make "posted childcare money REFUSES delete" true.
 *
 * Reachable through a governed action against HOSTED staging, that is a
 * different proposition. The predicates were narrowed to the fixture's own
 * program and agency; this module is what stops them drifting back.
 *
 * NOT A SQL PARSER. It is a narrow, fixture-specific contract: statement counts,
 * per-DELETE scoping, and what may execute while triggers are suspended. A
 * general parser would be a much larger thing to trust for a much smaller
 * return.
 *
 * EMPTINESS IS NOT THE ARGUMENT. That the six subsidy tables happen to hold no
 * unrelated rows today is not why this is safe; the predicates are. They must
 * keep holding once unrelated subsidy data exists.
 */
import { readFileSync } from "node:fs";

export const HOSTED_FIXTURE_PATH = "certification/fixtures/financials-demo-tenant.sql";

/** The fixture's own id namespace, plus the `\set` names bound to it. */
const FIXTURE_ID_PREFIX = "fd000000-";
const ORG_VAR = "org";

/**
 * The six that were org-wide, and the fixture-owned column each must now be
 * constrained through. Derived from 20260909120000_financial_subsidy.sql — not
 * guessed from the table names, which would have missed that `claims` carries
 * BOTH program_id and agency_id and that `remittances` hangs off agency_id alone.
 */
export const SUBSIDY_OWNERSHIP = Object.freeze({
  financial_subsidy_authorizations: "program_id",
  financial_subsidy_claims: "program_id",
  financial_subsidy_claim_lines: "claim_id",
  financial_subsidy_remittances: "agency_id",
  financial_subsidy_remittance_lines: "remittance_id",
  financial_subsidy_variances: "claim_line_id",
});

/** Split a `\set`-style psql fixture into its destructive statements. */
export function destructiveStatements(sql) {
  return [...String(sql).matchAll(/delete\s+from\s+([a-z_][a-z0-9_]*)[\s\S]*?;/gi)]
    .map((m) => ({ table: m[1], text: m[0].replace(/\s+/g, " ").trim() }));
}

/**
 * Is this DELETE constrained to something the fixture owns?
 *
 * A statement qualifies if it names any `\set` variable other than the
 * organization, or a literal from the fixture's own uuid namespace. Scoping by
 * organization ALONE is exactly the shape this contract exists to refuse.
 */
export function isFixtureScoped(text) {
  const vars = [...String(text).matchAll(/:'([a-z0-9_]+)'/gi)].map((m) => m[1]);
  return vars.some((v) => v !== ORG_VAR) || String(text).includes(FIXTURE_ID_PREFIX);
}

/**
 * Statements executing while replication triggers are suspended.
 *
 * MATCHED AS A STATEMENT, NOT AS A SUBSTRING. This read `indexOf` on the exact
 * text `set session_replication_role = replica`, so the fixture becoming atomic
 * — `SET LOCAL`, which is the form that cannot outlive a rolled-back
 * transaction — reported NO WINDOW AT ALL rather than a widened one. A contract
 * that answers "nothing to check here" when the thing it checks is rewritten is
 * the failure mode this module exists to avoid, so the boundary is anchored to
 * the start of a line and both forms are recognised.
 */
export function replicaWindow(sql) {
  const text = String(sql);
  const open = text.search(/^[ \t]*set\s+(?:local\s+)?session_replication_role\s*=\s*replica\b/im);
  const close = text.search(/^[ \t]*set\s+(?:local\s+)?session_replication_role\s*=\s*origin\b/im);
  if (open < 0 || close < 0 || close < open) return { ok: false, statements: [] };
  const body = text.slice(open, close);
  const statements = [...body.matchAll(/^\s*(insert|update|delete)\b/gim)].map((m) => m[1].toLowerCase());
  return { ok: true, statements, body };
}

/** The whole contract, as one measurement. */
export function auditHostedFixture(sql) {
  const deletes = destructiveStatements(sql);
  const orgWide = deletes.filter((d) => !isFixtureScoped(d.text));
  const win = replicaWindow(sql);
  const windowWrites = win.statements.filter((s) => s !== "delete");
  const subsidy = Object.entries(SUBSIDY_OWNERSHIP).map(([table, column]) => {
    const stmt = deletes.find((d) => d.table === table) || null;
    return {
      table,
      required_column: column,
      present: Boolean(stmt),
      scoped: stmt ? isFixtureScoped(stmt.text) : false,
      mentions_column: stmt ? stmt.text.includes(column) : false,
    };
  });
  return {
    total_deletes: deletes.length,
    fixture_scoped: deletes.length - orgWide.length,
    org_wide: orgWide.map((d) => d.table),
    replica_window_present: win.ok,
    replica_window_statements: win.statements.length,
    replica_window_non_delete: windowWrites,
    subsidy,
  };
}

export function readHostedFixture(repoRoot) {
  return readFileSync(`${repoRoot}/${HOSTED_FIXTURE_PATH}`, "utf8");
}
