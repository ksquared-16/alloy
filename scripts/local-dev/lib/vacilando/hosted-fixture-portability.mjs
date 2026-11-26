/**
 * WHAT MAKES A HOSTED CERTIFICATION FIXTURE PORTABLE, AND ATOMIC.
 *
 * `hosted-fixture-safety.mjs` answers "what may this fixture destroy". This one
 * answers the two questions that stopped the hosted acceptance dead, plus the
 * one that made failing dangerous:
 *
 *   WHOSE TENANT IS IT. The registered reconciliation freezes an organization
 *   and the runner passes it as `psql -v org=...`. The fixture then contained
 *   `\set org '00000000-0000-4000-8000-000000000001'`, and psql applies -v at
 *   startup and this file afterwards, so the file won. The runner reported the
 *   frozen organization in `fixture_audit` while every statement ran against a
 *   different one — an audit naming a tenant the writes never reached. On
 *   deployed staging that organization is not one of the three that exist, so
 *   the apply refused at its first insert; had it existed, the writes would
 *   have landed silently in the wrong place.
 *
 *   WHOSE CAMPUSES ARE THEY. Four agreements named two `locations` by uuid.
 *   Both belong to the local cert stack. `child_enrollment_agreements
 *   .site_location_id` is NOT NULL REFERENCES locations(id), so on any other
 *   database the fixture could not be written at all.
 *
 *   WHAT HAPPENS WHEN IT FAILS. psql -f is autocommit. The statements before a
 *   foreign-key refusal had already committed, so a failed apply left partial
 *   fixture rows in a tenant that holds real charges and journal entries.
 *
 * MEASURED ON EXECUTABLE TEXT. `--` comments are stripped first, deliberately:
 * the file explains the defect it used to have, and a contract that scanned
 * prose would force that history out of the file to stay green. What ran is
 * what is checked.
 *
 * NOT A SQL PARSER, for the same reason as its sibling: a narrow contract over
 * one known file, not a general thing to trust.
 */
import { readFileSync } from "node:fs";

export const HOSTED_FIXTURE_PATH = "certification/fixtures/financials-demo-tenant.sql";

/** The fixture's own id namespace. Anything else is somebody's database. */
export const FIXTURE_UUID_PREFIX = "fd000000-";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** The file with `--` commentary removed, so prose cannot satisfy or break a check. */
export function executableText(sql) {
  return String(sql)
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

/** Every `\set` of the organization variable. Must be empty: the runner owns it. */
export function organizationAssignments(sql) {
  return [...executableText(sql).matchAll(/^[ \t]*\\set[ \t]+org\b[^\n]*/gim)].map((m) => m[0].trim());
}

/** Is the absent-organization case refused rather than defaulted? */
export function organizationGuarded(sql) {
  return /\\if\s+:\{\?org\}/i.test(executableText(sql));
}

/** uuids written into the file that are not the fixture's own. */
export function foreignUuids(sql) {
  return [...new Set((executableText(sql).match(UUID_RE) || []).map((u) => u.toLowerCase()))]
    .filter((u) => !u.startsWith(FIXTURE_UUID_PREFIX));
}

/**
 * Are the agreement campuses resolved from the target organization?
 *
 * Three separate claims, because any one of them alone is satisfiable by
 * something that is not a resolution: a lookup that exists, a lookup actually
 * scoped to the caller's organization, and agreements that consume THAT rather
 * than a literal.
 */
export function locationResolution(sql) {
  const text = executableText(sql);
  const lookup = /from\s+locations\b[\s\S]{0,400}?location_type\s*=\s*'site'/i.test(text);
  const orgScoped = /from\s+locations\b[\s\S]{0,200}?org_id\s*=\s*:'org'/i.test(text);
  const captured = /\\gset/i.test(text) && /\bas\s+site_1\b/i.test(text) && /\bas\s+site_2\b/i.test(text);
  const consumed = (text.match(/:'site_[12]'/gi) || []).length;
  const agreementLiterals = [...text.matchAll(/site_location_id[\s\S]{0,600}?;/gi)]
    .flatMap((m) => m[0].match(UUID_RE) || []);
  return {
    lookup_present: lookup,
    organization_scoped: orgScoped,
    captured_deterministically: captured && /order\s+by\s+l\.id/i.test(text),
    agreements_consume_resolved: consumed >= 4,
    agreement_literal_uuids: agreementLiterals,
  };
}

/** Does the tenant's shape get checked before anything is destroyed? */
export function preconditions(sql) {
  const text = executableText(sql);
  const replica = text.search(/^[ \t]*set\s+(?:local\s+)?session_replication_role\s*=\s*replica\b/im);
  const org = text.search(/\\if\s+:org_present\b/i);
  const sites = text.search(/\\if\s+:sites_ok\b/i);
  return {
    organization_probe: org >= 0,
    site_sufficiency_probe: sites >= 0,
    // A precondition that runs after the first DELETE is not a precondition.
    before_any_mutation: org >= 0 && sites >= 0 && replica >= 0 && org < replica && sites < replica,
  };
}

/**
 * Is the whole fixture one transaction?
 *
 * The boundary must ENCLOSE the work, so the positions are measured rather than
 * the mere presence of the words: a `begin;` after the first delete, or a
 * `commit;` before the last insert, reads as atomic and is not.
 */
export function transactionBoundary(sql) {
  const text = executableText(sql);
  const begins = [...text.matchAll(/^[ \t]*begin\s*;/gim)];
  const commits = [...text.matchAll(/^[ \t]*commit\s*;/gim)];
  const firstDelete = text.search(/^[ \t]*delete\s+from\b/im);
  const writes = [...text.matchAll(/^[ \t]*insert\s+into\b/gim)];
  const lastWrite = writes.length ? writes[writes.length - 1].index : -1;
  const begin = begins.length ? begins[0].index : -1;
  const commit = commits.length ? commits[commits.length - 1].index : -1;
  return {
    begin_count: begins.length,
    commit_count: commits.length,
    encloses_teardown: begin >= 0 && firstDelete >= 0 && begin < firstDelete,
    encloses_declaration: commit >= 0 && lastWrite >= 0 && commit > lastWrite,
    // SET LOCAL is the form a rollback cannot outlive.
    suspension_is_transaction_local:
      /^[ \t]*set\s+local\s+session_replication_role\s*=\s*replica\b/im.test(text)
      && !/^[ \t]*set\s+session_replication_role\s*=\s*replica\b/im.test(text),
  };
}

/** The whole portability contract, as one measurement. */
export function auditHostedFixturePortability(sql) {
  const loc = locationResolution(sql);
  const tx = transactionBoundary(sql);
  const pre = preconditions(sql);
  return {
    organization_assignments: organizationAssignments(sql),
    organization_guarded: organizationGuarded(sql),
    foreign_uuids: foreignUuids(sql),
    location: loc,
    preconditions: pre,
    transaction: tx,
    portable:
      organizationAssignments(sql).length === 0
      && organizationGuarded(sql)
      && foreignUuids(sql).length === 0
      && loc.lookup_present && loc.organization_scoped
      && loc.captured_deterministically && loc.agreements_consume_resolved
      && loc.agreement_literal_uuids.length === 0
      && pre.before_any_mutation,
    atomic:
      tx.begin_count === 1 && tx.commit_count === 1
      && tx.encloses_teardown && tx.encloses_declaration
      && tx.suspension_is_transaction_local,
  };
}

export function readHostedFixture(repoRoot) {
  return readFileSync(`${repoRoot}/${HOSTED_FIXTURE_PATH}`, "utf8");
}
