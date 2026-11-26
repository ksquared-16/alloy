#!/usr/bin/env node
/**
 * Code-derived settings inventory: every setting key the deployed web app (Vercel), the backend (Render)
 * and the Supabase project read, found by reading source only. No environment, dashboard, credential or
 * network is consulted, and no value is ever read — the inventory is names and source locations.
 *
 *   node scripts/release/settings-inventory.mjs            # JSON: { "tier:key": { tier, key, kinds, refs } }
 *   node scripts/release/settings-inventory.mjs --keys     # one "tier<TAB>key<TAB>kind<TAB>first ref" per line
 *
 * Output keys are `tier:key`. The checklist it backs is docs/platform/runtime/environments-p1s-settings-checklist-2026-11-25.md;
 * scripts/release/tests/settings-checklist.test.mjs fails when the two disagree.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, "..", "..");

/** What ships, per tier. Tests, scripts and certification harnesses are excluded: they never run deployed. */
export const SCAN_ROOTS = {
    web: ["web/app", "web/lib", "web/components", "web/contexts", "web/hooks", "web/middleware.ts", "web/next.config.ts", "web/scripts/vercel-ignored-build.sh"],
    backend: ["backend/app", "backend/main.py"],
    supabase: ["supabase/migrations"],
};

const JS_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".jsx"]);
const EXCLUDED_DIR = new Set(["node_modules", ".next", "tests", "__tests__", "__pycache__", ".venv"]);
const isTestFile = (p) => /\.(test|spec)\.[a-z]+$/.test(p) || /(^|\/)test_[^/]+\.py$/.test(p);

const KEY = "[A-Z][A-Z0-9_]*[A-Z0-9]";
/** A literal shaped like an environment name: at least one underscore, so "PENDING" is never a candidate. */
const ENV_SHAPED = new RegExp(`^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$`);

const RULES = {
    js: [
        ["direct", new RegExp(`process\\.env(?:\\?\\.|\\.)(${KEY})\\b`, "g")],
        ["direct", new RegExp(`process\\.env\\[\\s*["'\`](${KEY})["'\`]\\s*\\]`, "g")],
        // A function that takes the environment as a parameter named `env` (the repo's idiom for testable reads).
        ["env-param", new RegExp(`(?<!process\\.)\\benv(?:\\?\\.|\\.)(${KEY})\\b`, "g")],
        ["env-param", new RegExp(`(?<!process\\.)\\benv\\[\\s*["'\`](${KEY})["'\`]\\s*\\]`, "g")],
    ],
    py: [
        ["direct", new RegExp(`os\\.getenv\\(\\s*["'](${KEY})["']`, "g")],
        ["direct", new RegExp(`os\\.environ\\.get\\(\\s*["'](${KEY})["']`, "g")],
        ["direct", new RegExp(`os\\.environ\\[\\s*["'](${KEY})["']`, "g")],
        ["env-param", new RegExp(`\\be\\.get\\(\\s*["'](${KEY})["']`, "g")],
    ],
    sh: [["direct", new RegExp(`\\$\\{?(${KEY})`, "g")]],
};

/** A file that looks a name up through a variable; its env-shaped literals are candidates (see `indirect`). */
const DYNAMIC_LOOKUP = {
    js: /process\.env\[\s*[A-Za-z_$]|\benv\[\s*[A-Za-z_$]|\(process\.env\)|=\s*process\.env\s*[,)]/,
    py: /os\.getenv\(\s*[a-z_]|os\.environ\.get\(\s*[a-z_]|\be\.get\(\s*[a-zA-Z_]/,
};

/** `env:NAME` is a provider-binding secret reference stored in the database and resolved from the environment. */
const SECRET_REF = new RegExp(`["']env:(${KEY})\\b`, "g");

function walk(abs, out) {
    let st;
    try {
        st = statSync(abs);
    } catch {
        return;
    }
    if (st.isDirectory()) {
        for (const name of readdirSync(abs).sort()) {
            if (EXCLUDED_DIR.has(name)) continue;
            walk(join(abs, name), out);
        }
    } else if (st.isFile()) {
        out.push(abs);
    }
}

function langOf(path) {
    const ext = extname(path);
    if (JS_EXT.has(ext)) return "js";
    if (ext === ".py") return "py";
    if (ext === ".sh") return "sh";
    if (ext === ".sql") return "sql";
    return null;
}

function lineOf(text, index) {
    let n = 1;
    for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
    return n;
}

/** The inventory is keyed by `tier:key`: the same name on Vercel and on Render is two settings to set. */
function add(inv, key, tier, kind, ref) {
    const id = `${tier}:${key}`;
    const e = inv.get(id) ?? { tier, key, kinds: new Set(), refs: [] };
    e.kinds.add(kind);
    if (!e.refs.some((r) => r.file === ref.file && r.line === ref.line)) e.refs.push(ref);
    inv.set(id, e);
}

/** Supabase settings the schema depends on: Vault secret names and extensions (names only). */
function scanSql(inv, rel, text) {
    for (const m of text.matchAll(/decrypted_secrets\b[\s\S]{0,400}?\.?name\s*=\s*'([a-z][a-z0-9_]*)'/g)) {
        add(inv, m[1], "supabase", "vault-secret", { file: rel, line: lineOf(text, m.index + m[0].length) });
    }
    for (const m of text.matchAll(/create\s+extension\s+(?:if\s+not\s+exists\s+)?"?([a-z][a-z0-9_-]*)"?/gi)) {
        add(inv, `extension:${m[1].toLowerCase()}`, "supabase", "extension", { file: rel, line: lineOf(text, m.index) });
    }
    for (const m of text.matchAll(/insert\s+into\s+storage\.buckets[\s\S]{0,200}?'([a-z][a-z0-9_-]*)'/gi)) {
        add(inv, `bucket:${m[1]}`, "supabase", "storage-bucket", { file: rel, line: lineOf(text, m.index) });
    }
}

export function scanSettings(root = REPO_ROOT) {
    const inv = new Map();
    for (const [tier, roots] of Object.entries(SCAN_ROOTS)) {
        const files = [];
        for (const r of roots) walk(join(root, r), files);
        for (const abs of files) {
            const rel = relative(root, abs);
            if (isTestFile(rel)) continue;
            const lang = langOf(rel);
            if (!lang) continue;
            const text = readFileSync(abs, "utf8");
            if (lang === "sql") {
                scanSql(inv, rel, text);
                continue;
            }
            const found = new Set();
            for (const [kind, re] of RULES[lang]) {
                for (const m of text.matchAll(re)) {
                    found.add(m[1]);
                    add(inv, m[1], tier, kind, { file: rel, line: lineOf(text, m.index) });
                }
            }
            for (const m of text.matchAll(SECRET_REF)) {
                found.add(m[1]);
                add(inv, m[1], tier, "secret-ref", { file: rel, line: lineOf(text, m.index) });
            }
            const dyn = DYNAMIC_LOOKUP[lang];
            if (dyn && dyn.test(text)) {
                for (const m of text.matchAll(/["'`]([A-Z][A-Z0-9_]*[A-Z0-9])["'`]/g)) {
                    if (!ENV_SHAPED.test(m[1]) || found.has(m[1])) continue;
                    add(inv, m[1], tier, "indirect", { file: rel, line: lineOf(text, m.index) });
                }
            }
        }
    }
    // A key also read directly is not "indirect" anywhere; keep the strongest evidence.
    for (const e of inv.values()) {
        if (e.kinds.size > 1) e.kinds.delete("indirect");
    }
    return inv;
}

export function inventoryToJson(inv) {
    const out = {};
    for (const id of [...inv.keys()].sort()) {
        const e = inv.get(id);
        out[id] = { tier: e.tier, key: e.key, kinds: [...e.kinds].sort(), refs: e.refs };
    }
    return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const inv = scanSettings();
    if (process.argv.includes("--keys")) {
        for (const e of Object.values(inventoryToJson(inv))) {
            const ref = e.refs[0];
            process.stdout.write(`${e.tier}\t${e.key}\t${e.kinds.join(",")}\t${ref.file}:${ref.line}\t${e.refs.length}\n`);
        }
    } else {
        process.stdout.write(`${JSON.stringify(inventoryToJson(inv), null, 2)}\n`);
    }
}
