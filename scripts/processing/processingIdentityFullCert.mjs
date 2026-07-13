#!/usr/bin/env node
/**
 * Full Processing Identity local certification orchestrator.
 * Resets isolated stack, runs Postgres cert runner + vitest processing suites serially.
 *
 * Requires isolated stack on 55321/55322.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const web = resolve(root, "web");
const certEnvPath = resolve(web, ".env.local");

const env = { ...process.env };

function loadCertEnvFile() {
    if (!existsSync(certEnvPath)) return;
    for (const line of readFileSync(certEnvPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) env[m[1]] = m[2];
    }
}

function run(cmd, args, cwd = root) {
    const r = spawnSync(cmd, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" });
    if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("=== Processing Identity Full Local Certification ===\n");

console.log("1) Reset isolated cert database…");
run("bash", ["./scripts/processing/processingIdentityCertStack.sh", "reset"]);

console.log("2) Refresh cert env…");
run("npm", ["run", "cert:processing-identity-env"]);
loadCertEnvFile();
if (env.PROCESSING_LOCAL_CERT_ENABLED !== "true" || !String(env.NEXT_PUBLIC_SUPABASE_URL || "").includes(":55321")) {
    console.error("Cert env refresh did not target isolated stack :55321");
    process.exit(1);
}

console.log("3) Postgres cert runner (17 checks)…");
run("npm", ["run", "cert:processing-identity-local"]);

console.log("4) Processing vitest suites (serial file execution; cert env loaded for integrations)…");
run(
    "npm",
    [
        "run",
        "test",
        "--",
        "--no-file-parallelism",
        "tests/processing",
        "tests/pos/recordResolverSeam.test.ts",
    ],
    web,
);

console.log("5) Typecheck + production build…");
run("npm", ["run", "typecheck"], web);
run("npm", ["run", "typecheck:tests"], web);
run("npm", ["run", "build"], web);

console.log("\n=== Full certification PASS ===");
