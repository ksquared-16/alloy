#!/usr/bin/env npx tsx
/**
 * Export one tenant's configuration — the allowlist only — as a reviewable file (briefing M8, step 6). Run from
 * `web/`:
 *
 *   ALLOY_ENVIRONMENT=staging TENANT_CONFIG_EXPORT_DATABASE_URL='postgresql://…' \
 *   npm run tenant:config:export -- --target staging --confirm-project-ref ikaxilmwmrmbagoidedu \
 *     --org-id 93667019-bd28-49b5-a688-acc9bb1e0a19 --out <release-dir>/firefly-config-export.json
 *
 *   --target local                      a loopback database (default URL: the shared stack's postgres)
 *   --kinds sites,rooms,…               a subset of the allowlist (default: all of it); anything else is refused
 *   --keep-seed-config                  local only: keep the E2 seed's configuration rows (they carry the seed marker)
 *
 * Read-only end to end: one `BEGIN READ ONLY … ROLLBACK` statement (lib/tenancy/configTransfer/exportSql.ts) in a
 * session with default_transaction_read_only=on. Targets: lib/staging/fireflyStagingSeed/targets.ts (local and
 * staging only; the production refs are refused). The database URL is a credential: it comes from the environment
 * and is printed masked. The file is written once; an existing file is refused.
 */

import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, writeFileSync } from "fs";

import { refusalReasonForKind, TRANSFERABLE_KINDS, type TransferableKind } from "@/lib/tenancy/configTransfer/allowlist";
import { buildExportFile, exportCounts, validateExportFile, type RawExport } from "@/lib/tenancy/configTransfer/exportFile";
import { renderExportSql } from "@/lib/tenancy/configTransfer/exportSql";
import { redactDatabaseUrl, resolveSeedTarget } from "@/lib/staging/fireflyStagingSeed/targets";
import { argFlag, argValue } from "@/lib/tenancy/operatorSession";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string, code = 1): never {
    console.error(`✗ ${message}`);
    process.exit(code);
}

function main(): void {
    const argv = process.argv.slice(2);
    const kindsArg = argValue(argv, "kinds");
    const requested = kindsArg ? kindsArg.split(",").map((k) => k.trim()).filter(Boolean) : [...TRANSFERABLE_KINDS];
    const refused = requested.map((k) => [k, refusalReasonForKind(k)] as const).filter(([, r]) => r);
    if (refused.length) {
        fail(`refused (outside the allowlist), nothing was read:\n${refused.map(([k, r]) => `  - ${k}: ${r}`).join("\n")}`, 4);
    }
    const kinds = requested as TransferableKind[];

    const orgId = (argValue(argv, "org-id") ?? "").trim().toLowerCase();
    if (!UUID.test(orgId)) fail("--org-id must be the source org's id", 3);
    const out = argValue(argv, "out");
    if (!out) fail("--out <file> is required", 3);
    if (existsSync(out)) fail(`${out} exists; an export is written once (choose a new name)`, 3);

    const target = resolveSeedTarget({
        target: argValue(argv, "target"),
        databaseUrl: process.env.TENANT_CONFIG_EXPORT_DATABASE_URL ?? null,
        confirmProjectRef: argValue(argv, "confirm-project-ref"),
        alloyEnvironment: process.env.ALLOY_ENVIRONMENT ?? null,
    });
    if (!target.ok) fail(`refused (${target.code}): ${target.detail.replace("FIREFLY_STAGING_SEED_DATABASE_URL", "TENANT_CONFIG_EXPORT_DATABASE_URL")}`, 3);
    const keepSeedConfig = argFlag(argv, "keep-seed-config");
    if (keepSeedConfig && target.target !== "local") fail("--keep-seed-config is local-only", 3);

    console.log(`export: ${target.target} ${redactDatabaseUrl(target.databaseUrl)}  org ${orgId}`);
    console.log(`  kinds: ${kinds.join(", ")}`);
    const res = spawnSync(
        "psql",
        [target.databaseUrl, "-X", "-q", "-A", "-t", "-v", `org_id=${orgId}`, "-f", "-"],
        {
            input: renderExportSql(),
            encoding: "utf8",
            env: { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on" },
            maxBuffer: 64 * 1024 * 1024,
        },
    );
    if (res.error) fail(`could not start psql: ${res.error.message} (environment problem)`, 2);
    if (res.status !== 0) fail(`the export read failed:\n${(res.stderr ?? "").trim()}`);
    const line = (res.stdout ?? "").split("\n").find((l) => l.trim().startsWith("{"));
    if (!line) fail("the export read printed no document");

    const built = buildExportFile({
        raw: JSON.parse(line) as RawExport,
        kinds,
        environment: target.target,
        host: target.host,
        projectRef: target.projectRef,
        exportedAt: new Date().toISOString(),
        keepSeedConfig,
    });
    if (!built.ok) fail(`refused: ${built.error}`, 4);
    // The import's own gate, run on what was just built: an export the import would refuse is never written.
    const checked = validateExportFile(JSON.parse(JSON.stringify(built.file)));
    if (!checked.ok) fail(`the built file fails the import's validation:\n  - ${checked.errors.join("\n  - ")}`);

    const text = `${JSON.stringify(built.file, null, 2)}\n`;
    writeFileSync(out, text, { flag: "wx" });
    console.log(`  source org: ${built.file.source.org_name}${keepSeedConfig ? "  (seed configuration kept: local only)" : ""}`);
    console.log(`  items: ${JSON.stringify(exportCounts(built.file))}`);
    console.log(`  left behind: ${built.file.left_behind.length}`);
    for (const l of built.file.left_behind) console.log(`    - ${l.kind}: ${l.label} (${l.reason})`);
    console.log(`  metadata keys dropped: ${built.file.dropped_metadata_keys.map((d) => `${d.ref} [${d.keys.join(", ")}]`).join("; ") || "none"}`);
    console.log(`✓ wrote ${out}`);
    console.log(`  sha256 ${createHash("sha256").update(text).digest("hex")}`);
}

main();
