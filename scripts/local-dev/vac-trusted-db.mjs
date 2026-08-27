#!/usr/bin/env node
/**
 * The trusted database executor — the only path that holds a credential.
 *
 * Two capabilities, kept apart on purpose (S3's decision): `apply` performs the
 * registered migration write, `read` performs the bounded verification reads.
 * Verification exists to contradict execution, so evidence produced under the
 * same authority that performed the write is weaker evidence — and a verifier
 * that cannot write is a verifier that cannot accidentally repair what it is
 * checking.
 *
 * THE CREDENTIAL NEVER TOUCHES A SHELL VARIABLE, AN ARGUMENT, OR A LOG. It is
 * resolved here, placed directly into the spawned child's environment, and
 * scrubbed from the inherited environment first so an ambient DATABASE_URL can
 * never survive alongside — or instead of — the environment-bound one. Every
 * byte of child output is redacted before it is returned.
 *
 *   vac-trusted-db.mjs apply --ref <trusted_secret:x> --environment <env> --file <sql>
 *   vac-trusted-db.mjs read  --ref <trusted_secret:x> --environment <env> --probe <kind> --subject <name>
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

import {
  ROW_MARKER,
  executorChildEnv,
  parseMarkedRows,
  redactDatabaseUrls,
  resolveForExecutorChild,
} from "./lib/vacilando/trusted-credential.mjs";
import { VERIFICATION_PROBES, realReadVerdict } from "./lib/vacilando/executor-authority.mjs";

const argv = process.argv.slice(2);
const mode = argv.shift();
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] ?? null : null; };
const ref = flag("--ref");
const environment = flag("--environment");
const FIELD_SEP = "|";

function emit(obj, code = 0) {
  process.stdout.write(redactDatabaseUrls(JSON.stringify(obj, null, 2)) + "\n");
  process.exit(code);
}

if (!["apply", "read"].includes(mode)) {
  process.stderr.write("usage: vac-trusted-db.mjs apply|read --ref <ref> --environment <env>\n");
  process.exit(2);
}
if (!ref || !environment) emit({ ok: false, refusal: "ref_and_environment_required" }, 2);

/**
 * The bounded read set. Named relations, parameterised subject — never a query
 * assembled from caller text. A verification capability that can run arbitrary
 * SQL is a database capability wearing a smaller name.
 */
const READ_QUERIES = {
  relation_exists: "select '" + ROW_MARKER + "', table_schema, table_name from information_schema.tables where table_name = :'subj'",
  permission_exists: "select '" + ROW_MARKER + "', key from permission_definitions where key = :'subj'",
  grant_exists: "select '" + ROW_MARKER + "', role_key, permission_key from role_permission_grants where permission_key = :'subj'",
};

const resolved = resolveForExecutorChild(ref, { environment, callerIsTrustedExecutor: true });
if (!resolved.ok) {
  // Truthful stop at provisioning. The refusal names the reference, never a value.
  emit({ ok: false, capability: mode === "apply" ? "trusted_host.database.migrate" : "trusted_host.database.read", ...resolved }, 42);
}

const childEnv = executorChildEnv(process.env, resolved);

function runPsql(args, stdin) {
  return new Promise((done) => {
    const child = spawn("psql", args, { env: childEnv, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => done({ code: null, out: "", err: String(e.message || e), spawn_failed: true }));
    child.on("close", (code) => done({ code, out, err }));
    if (stdin != null) child.stdin.write(stdin);
    child.stdin.end();
  });
}

// psql reads the connection from DATABASE_URL in the child env; it is never an
// argument, so it cannot appear in a process listing.
const CONN = ["-X", "--no-psqlrc", "-v", "ON_ERROR_STOP=1"];

if (mode === "apply") {
  const file = flag("--file");
  if (!file || !existsSync(file)) emit({ ok: false, refusal: "migration_file_missing", file }, 2);
  const r = await runPsql(CONN.concat(["-f", file]));
  emit({
    ok: r.code === 0,
    capability: "trusted_host.database.migrate",
    environment: resolved.environment,
    // Durable evidence carries the REFERENCE, never the value.
    credential_reference: resolved.durable_record.credential_reference,
    exit_code: r.code,
    stdout: redactDatabaseUrls(r.out).slice(-4000),
    stderr: redactDatabaseUrls(r.err).slice(-4000),
  }, r.code === 0 ? 0 : 1);
}

// -- read --------------------------------------------------------------------
const probe = flag("--probe");
const subject = flag("--subject");
if (!READ_QUERIES[probe]) emit({ ok: false, refusal: "unknown_probe", probe, allowed: Object.keys(READ_QUERIES) }, 2);
if (!subject) emit({ ok: false, refusal: "subject_required" }, 2);

/**
 * The subject is bound with psql's :'subj' interpolation, which emits a
 * properly quoted literal — the subject never becomes part of the statement.
 *
 * AND EVERY ROW CARRIES A MARKER. The first version used a PREPARE/EXECUTE
 * pair, and psql echoed the command tag `PREPARE` to stdout. The row parser
 * counted that non-empty line as a row, so EVERY probe returned present=true —
 * including `table_that_certainly_does_not_exist_xyz`. That is exactly the
 * failure this whole contract exists to prevent: a probe that answers
 * confidently without reading the thing it claims to read. It was caught by a
 * negative control, not by the code.
 *
 * Requiring a marker column makes the false positive structurally impossible: a
 * psql command tag, a notice, or a blank line can never begin with it, so only
 * a real result row is ever counted.
 */
// The query arrives on STDIN, not via -c: psql performs :'subj' interpolation
// only for input it reads from a file or stdin, and a -c query is sent verbatim
// — which fails with a syntax error at the colon rather than binding anything.
const r = await runPsql(
  CONN.concat(["-q", "-t", "-A", "-F", FIELD_SEP, "-v", "subj=" + subject]),
  READ_QUERIES[probe] + ";\n",
);

const ran = r.code === 0 && !r.spawn_failed;
const rows = ran ? parseMarkedRows(r.out, { marker: ROW_MARKER, separator: FIELD_SEP }) : null;

emit({
  ok: ran,
  capability: "trusted_host.database.read",
  environment: resolved.environment,
  credential_reference: resolved.durable_record.credential_reference,
  probe,
  subject,
  reads: VERIFICATION_PROBES[probe] ? VERIFICATION_PROBES[probe].reads : null,
  // The proof shape the router enforces.
  verdict: realReadVerdict({ probe, ran, rows, error: ran ? null : redactDatabaseUrls(r.err || "psql did not run") }),
}, ran ? 0 : 1);
