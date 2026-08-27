#!/usr/bin/env node
/**
 * Register and inspect trusted credential bindings.
 *
 * THE VALUE NEVER PASSES THROUGH AN ARGUMENT, A LOG, OR A REPORT. `register`
 * reads it from stdin or derives it from a named local source, writes it 0600,
 * and prints only the reference and its metadata. There is no subcommand that
 * prints a secret, by construction — `status` reads the metadata file, which
 * never contains one.
 *
 *   vac trusted-credential status <trusted_secret:name>
 *   vac trusted-credential register <trusted_secret:name> --environment <env> --stdin
 *   vac trusted-credential register <trusted_secret:name> --environment <env> --from-local-stack <project>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  CREDENTIAL_ISOLATION,
  credentialBindingStatus,
  readCredentialMetadata,
  redactDatabaseUrls,
  referenceIsWellFormed,
  registerCredential,
  storeIsOutsideWorktrees,
} from "./lib/vacilando/trusted-credential.mjs";

const argv = process.argv.slice(2);
const cmd = argv.shift();
const ref = argv.shift();
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : true) : null; };

function die(msg, code = 2) { process.stderr.write(`${msg}\n`); process.exit(code); }

if (!cmd || cmd === "-h" || cmd === "--help") {
  process.stdout.write(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(2, 14).map((l) => l.replace(/^ \* ?/, "")).join("\n") + "\n");
  process.exit(0);
}
if (!referenceIsWellFormed(ref)) die(`not a well-formed reference: ${ref}\nexpected trusted_secret:<lower_snake_name>`);

if (cmd === "status") {
  const meta = readCredentialMetadata(ref);
  const where = storeIsOutsideWorktrees();
  process.stdout.write(`${JSON.stringify({ ...meta, store_outside_worktrees: where.ok, store_dir: where.dir, isolation: CREDENTIAL_ISOLATION }, null, 2)}\n`);
  process.exit(meta.ok ? 0 : 1);
}

if (cmd !== "register") die(`unknown command: ${cmd}`);

const environment = flag("--environment");
if (!environment || environment === true) die("--environment is required");

/**
 * Where the value comes from. Neither path lets it reach a report.
 *
 * `--stdin` is the operator route. `--from-local-stack` derives a LOCAL
 * Supabase connection from the running stack — a local development database,
 * never a hosted one — so provisioning a certification environment does not
 * require anybody to handle a secret by hand.
 */
function valueProvider() {
  if (flag("--stdin")) {
    const raw = readFileSync(0, "utf8").trim();
    if (!raw) die("no value on stdin");
    return raw;
  }
  const project = flag("--from-local-stack");
  if (project && project !== true) {
    let ports = "";
    try {
      ports = String(execFileSync("docker", ["port", `supabase_db_${project}`, "5432"], { encoding: "utf8", timeout: 10000 })).trim();
    } catch { die(`local stack ${project} is not running (no supabase_db_${project} container)`); }
    const m = ports.split("\n")[0]?.match(/:(\d+)$/);
    if (!m) die(`could not read the published port for supabase_db_${project}`);
    const port = m[1];
    // The local Supabase superuser connection. Local-only by construction: the
    // host is pinned to loopback, so this value can never name a hosted target.
    return `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  }
  die("provide --stdin or --from-local-stack <project>");
  return null;
}

const out = registerCredential({
  reference: ref,
  environment,
  kind: "postgres_url",
  hostClass: flag("--from-local-stack") ? "local_loopback" : "operator_supplied",
  readValue: valueProvider,
});
if (!out.ok) die(`registration failed: ${out.error}`);

const status = credentialBindingStatus(ref, { environment });
// Redaction on the way out is belt-and-braces: nothing here should contain a
// value, and if a future change makes one leak, it still does not print.
process.stdout.write(redactDatabaseUrls(JSON.stringify({ registered: out, binding: status }, null, 2)) + "\n");
