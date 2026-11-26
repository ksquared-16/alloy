#!/usr/bin/env npx tsx
/**
 * Deployment guard — fail when tracked code imports modules that are missing or untracked.
 *
 * Vercel builds from git only. A common failure mode is committing import changes without
 * `git add` on new module files (Turbopack: "Module not found").
 *
 * Run from `web/`:
 *   npm run verify:module-imports
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aliasImportsIn } from "./lib/aliasImports";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "..");

function gitLines(cmd: string): string[] {
    return execSync(cmd, { cwd: repoRoot, encoding: "utf8" })
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
}

function resolveAliasImport(importPath: string): string | null {
    if (!importPath.startsWith("@/")) return null;
    return resolve(webRoot, importPath.slice(2));
}

function moduleExists(basePath: string): boolean {
    if (existsSync(basePath)) return true;
    return (
        existsSync(`${basePath}.ts`) ||
        existsSync(`${basePath}.tsx`) ||
        existsSync(resolve(basePath, "index.ts")) ||
        existsSync(resolve(basePath, "index.tsx"))
    );
}

const trackedUnderWeb = gitLines('git ls-files "web"').filter(
    (p) => p.startsWith("web/") && (p.endsWith(".ts") || p.endsWith(".tsx"))
).map((p) => p.replace(/^web\//, ""));
const untrackedUnderWeb = new Set(
    gitLines('git ls-files --others --exclude-standard "web"').filter(
        (p) => p.startsWith("web/") && (p.endsWith(".ts") || p.endsWith(".tsx"))
    ).map((p) => p.replace(/^web\//, ""))
);

type Issue = { kind: "missing" | "untracked"; file: string; importPath: string; resolved: string };

const issues: Issue[] = [];

for (const rel of trackedUnderWeb) {
    const abs = resolve(webRoot, rel);
    if (!existsSync(abs)) continue;
    const paths = aliasImportsIn(readFileSync(abs, "utf8"));

    for (const importPath of paths) {
        const resolved = resolveAliasImport(importPath);
        if (!resolved) continue;
        const relTarget = resolved.slice(webRoot.length + 1);
        if (!moduleExists(resolved)) {
            issues.push({ kind: "missing", file: rel, importPath, resolved: relTarget });
            continue;
        }
        const trackedCandidates = [
            relTarget,
            `${relTarget}.ts`,
            `${relTarget}.tsx`,
            resolve(relTarget, "index.ts").slice(webRoot.length + 1),
        ];
        const isTracked = trackedCandidates.some((c) => trackedUnderWeb.includes(c.replace(/\\/g, "/")));
        const isUntracked = trackedCandidates.some((c) => untrackedUnderWeb.has(c.replace(/\\/g, "/")));
        if (!isTracked && isUntracked) {
            issues.push({ kind: "untracked", file: rel, importPath, resolved: relTarget });
        }
    }
}

if (issues.length === 0) {
    console.log(`verify:module-imports ok (${trackedUnderWeb.length} files)`);
    process.exit(0);
}

console.error(
    JSON.stringify(
        {
            ok: false,
            error:
                "Tracked web code imports modules that are missing or not committed. Add the files before deploy.",
            issue_count: issues.length,
            issues: issues.slice(0, 30),
            hint: "Run: git status web/lib web/components && npm run build",
        },
        null,
        2
    )
);
process.exit(1);
