#!/usr/bin/env node
/**
 * Arrival-day secret/config preflight for a Vacilando execution node.
 *
 * A Vacilando backup is durable STATE, not a machine image: it carries lanes,
 * runs and node identity, and deliberately carries no credentials. This check
 * names what a node still needs and fails closed when any of it is absent.
 *
 * It never prints a secret value. Every check reports presence, shape or an
 * exit status only — so its output is safe to paste into a runbook or an issue.
 *
 *   node vacilando-secret-preflight.mjs [--json] [--repo <path>]
 *
 * Exit 0 only when every REQUIRED item is present. Optional items are reported
 * but never fail the run.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const asJson = process.argv.includes("--json");
const repoArg = process.argv.includes("--repo")
  ? process.argv[process.argv.indexOf("--repo") + 1]
  : null;

const HOME = homedir();
const REPO = repoArg || process.env.ALLOY_REPO || join(HOME, "Alloy");
const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT
  || join(HOME, ".local", "state", "alloy-dev", "gateway");
const VAC = join(RUNTIME_ROOT, "vacilando");

const results = [];

function record({ id, required, ok, detail, remedy }) {
  results.push({ id, required, ok, detail, remedy });
}

/** Presence + non-emptiness only. The value is never read into the report. */
function fileHasContent(path, minBytes = 1) {
  try {
    return statSync(path).size >= minBytes;
  } catch {
    return false;
  }
}

function checkFile({ id, path, required = true, minBytes = 1, remedy }) {
  const ok = fileHasContent(path, minBytes);
  record({
    id,
    required,
    ok,
    detail: ok ? `present (${statSync(path).size} bytes)` : `missing: ${path}`,
    remedy,
  });
}

/** Reports which KEYS a JSON secret file defines — never their values. */
function checkJsonKeys({ id, path, requiredKeys, required = true, remedy }) {
  if (!fileHasContent(path)) {
    record({ id, required, ok: false, detail: `missing: ${path}`, remedy });
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    record({ id, required, ok: false, detail: "present but not valid JSON", remedy });
    return;
  }
  const missing = requiredKeys.filter((k) => {
    const v = k.split(".").reduce((acc, part) => (acc == null ? acc : acc[part]), parsed);
    return v == null || v === "";
  });
  record({
    id,
    required,
    ok: missing.length === 0,
    detail: missing.length === 0
      ? `defines ${requiredKeys.join(", ")}`
      : `absent keys: ${missing.join(", ")}`,
    remedy,
  });
}

/** Runs a command for its EXIT STATUS. stdout is discarded, never reported. */
function checkCommand({ id, cmd, args, required = true, remedy, detailOk, detailFail }) {
  let ok = false;
  try {
    execFileSync(cmd, args, { stdio: "ignore", timeout: 20_000 });
    ok = true;
  } catch {
    ok = false;
  }
  record({ id, required, ok, detail: ok ? detailOk : detailFail, remedy });
}

function checkBinary({ id, cmd, required = true, remedy }) {
  let ok = false;
  try {
    execFileSync("command", ["-v", cmd], { stdio: "ignore", shell: "/bin/bash" });
    ok = true;
  } catch {
    try {
      execFileSync("/bin/bash", ["-lc", `command -v ${cmd}`], { stdio: "ignore" });
      ok = true;
    } catch {
      ok = false;
    }
  }
  record({ id, required, ok, detail: ok ? "on PATH" : "not on PATH", remedy });
}

// ---------------------------------------------------------------- checks

// 1. Trusted-host application environment. Privileged values live with the
//    trusted host; Development Lanes get the agent-safe file only. Placing the
//    privileged file inside a worktree is a downgrade, so it is not checked for
//    there on purpose.
checkFile({
  id: "env.web_local",
  path: join(REPO, "web", ".env.local"),
  remedy: "copy web/.env.local to the canonical checkout by hand (never into a worktree)",
});

// 2. Gateway API token. Created on first Gateway start; required before any
//    remote or PWA access works.
checkFile({
  id: "gateway.api_token",
  path: join(VAC, "api-token"),
  minBytes: 16,
  remedy: "start the Gateway once; it mints the token at first start",
});

// 3. Web push. Notification delivery is a GO gate, and a restored node with no
//    VAPID keypair cannot deliver to a subscribed iPhone.
checkJsonKeys({
  id: "gateway.web_push_vapid",
  path: join(VAC, "web-push.json"),
  requiredKeys: ["vapid.publicKey", "vapid.privateKey"],
  remedy: "place web-push.json from the operator's secret store; do not regenerate VAPID keys or existing subscriptions break",
});

// 4. Trusted-host secrets that the trusted host legitimately owns.
checkFile({
  id: "trusted_host.cert_principal",
  path: join(VAC, "trusted-secrets", "staging-certification-principal.env"),
  required: false,
  remedy: "place only if this node runs staging certification",
});

// 5. Provider authentication. Interactive logins — expected operator work, and
//    deliberately NOT automatable.
checkBinary({
  id: "provider.claude_cli",
  cmd: "claude",
  remedy: "install Claude Code, then log in interactively on the node",
});
checkCommand({
  id: "auth.github",
  cmd: "gh",
  args: ["auth", "status"],
  detailOk: "gh reports an authenticated account",
  detailFail: "gh is not authenticated (or not installed)",
  remedy: "run `gh auth login` on the node — interactive, operator-owned",
});
checkCommand({
  id: "auth.tailscale",
  cmd: "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
  args: ["status"],
  detailOk: "tailscaled reports a joined tailnet",
  detailFail: "Tailscale is not joined (or not installed at the expected path)",
  remedy: "sign in to Tailscale on the node — interactive, operator-owned",
});

// 6. Node-local toolkit provenance. Not a secret, but a node that resolves its
//    toolkit through a worktree is exactly the defect Phase A removed.
{
  const link = join(HOME, "bin", "alloy-dev");
  let target = null;
  try {
    target = execFileSync("/bin/bash", ["-lc", `readlink -f ${JSON.stringify(link)}`], {
      encoding: "utf8",
      timeout: 10_000,
    }).trim();
  } catch {
    target = null;
  }
  const ok = Boolean(target) && !target.includes("/alloy-worktrees/");
  record({
    id: "toolkit.not_worktree_resolved",
    required: true,
    ok,
    detail: target ? (ok ? "resolves outside any worktree" : "RESOLVES THROUGH A WORKTREE") : "no toolkit link",
    remedy: "alloy-toolkit install origin/staging",
  });
}

// ---------------------------------------------------------------- report

const requiredFailures = results.filter((r) => r.required && !r.ok);
const optionalFailures = results.filter((r) => !r.required && !r.ok);

if (asJson) {
  console.log(JSON.stringify({
    ok: requiredFailures.length === 0,
    checked_at: new Date().toISOString(),
    runtime_root: RUNTIME_ROOT,
    repo: REPO,
    required_missing: requiredFailures.map((r) => r.id),
    optional_missing: optionalFailures.map((r) => r.id),
    results,
  }, null, 2));
} else {
  for (const r of results) {
    const mark = r.ok ? "ok  " : (r.required ? "FAIL" : "warn");
    console.log(`${mark}  ${r.id.padEnd(34)} ${r.detail}`);
    if (!r.ok && r.remedy) console.log(`      → ${r.remedy}`);
  }
  console.log("");
  console.log(requiredFailures.length === 0
    ? `secret preflight PASS (${results.length} checks, ${optionalFailures.length} optional absent)`
    : `secret preflight FAIL — ${requiredFailures.length} required item(s) missing`);
}

process.exit(requiredFailures.length === 0 ? 0 : 1);
