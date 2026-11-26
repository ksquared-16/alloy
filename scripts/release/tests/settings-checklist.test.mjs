/**
 * The P1S settings checklist agrees with the code, offline (no network, no environment read):
 *
 *   node --test scripts/release/tests/settings-checklist.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { REPO_ROOT, scanSettings } from "../settings-inventory.mjs";

const CHECKLIST = "docs/platform/runtime/environments-p1s-settings-checklist-2026-11-25.md";
const TIERS = ["web", "backend", "supabase"];
const CLASSES = new Set(["R", "C", "O", "F", "A", "L", "S", "D", "X", "B", "P"]);

/** Rows of each `<!-- settings:<section> -->` … `<!-- /settings -->` table, by section. */
function parseChecklist(markdown) {
    const sections = {};
    for (const m of markdown.matchAll(/<!-- settings:([a-z]+) -->\n([\s\S]*?)<!-- \/settings -->/g)) {
        const rows = m[2]
            .split("\n")
            .filter((l) => /^\| `/.test(l))
            .map((l) => l.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim()));
        sections[m[1]] = rows;
    }
    return sections;
}

const unquote = (cell) => cell.replace(/^`|`$/g, "");

function checklistEntries() {
    const sections = parseChecklist(readFileSync(join(REPO_ROOT, CHECKLIST), "utf8"));
    const listed = new Map();
    for (const tier of TIERS) {
        assert.ok(sections[tier], `checklist has a settings:${tier} table`);
        for (const row of sections[tier]) {
            const [key, cls, , , readAt] = row;
            listed.set(`${tier}:${unquote(key)}`, { cls, readAt: unquote(readAt) });
        }
    }
    const excluded = new Map();
    for (const row of sections.excluded ?? []) excluded.set(unquote(row[0]), { readAt: unquote(row[2]) });
    return { listed, excluded };
}

test("every key the code reads is in the checklist or named as not a setting", () => {
    const inv = scanSettings();
    const { listed, excluded } = checklistEntries();
    const missing = [...inv.keys()].filter((id) => !listed.has(id) && !excluded.has(id));
    assert.deepEqual(missing, [], "add these to the checklist (or to its not-a-setting list)");
});

test("the checklist names no key the code does not read", () => {
    const inv = scanSettings();
    const { listed, excluded } = checklistEntries();
    const invented = [...listed.keys(), ...excluded.keys()].filter((id) => !inv.has(id));
    assert.deepEqual(invented, [], "these rows have no reader in the scanned code");
    const both = [...listed.keys()].filter((id) => excluded.has(id));
    assert.deepEqual(both, [], "a key is either a setting or not");
});

test("each row has a known class, and its cited file reads the key", () => {
    const { listed, excluded } = checklistEntries();
    for (const [id, row] of [...listed, ...excluded]) {
        if (listed.has(id)) assert.ok(CLASSES.has(row.cls), `${id}: unknown class ${row.cls}`);
        const [file, line] = row.readAt.split(/:(?=\d+$)/);
        assert.ok(line, `${id}: "Read at" is file:line`);
        const key = id.slice(id.indexOf(":") + 1).replace(/^(extension|bucket):/, "");
        const text = readFileSync(join(REPO_ROOT, file), "utf8");
        assert.ok(text.includes(key), `${id}: ${file} does not contain ${key}`);
        assert.ok(Number(line) <= text.split("\n").length, `${id}: ${file} has no line ${line}`);
    }
});

test("the checklist contains no credential-shaped value", () => {
    const text = readFileSync(join(REPO_ROOT, CHECKLIST), "utf8");
    const shapes = [
        ["JWT (Supabase key)", /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
        ["Supabase secret key", /sb_(secret|publishable)_[A-Za-z0-9_-]{8,}/],
        ["Stripe key", /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/],
        ["Stripe webhook secret", /\bwhsec_[A-Za-z0-9]{8,}/],
        ["Resend key", /\bre_[A-Za-z0-9]{16,}/],
        ["Twilio SID", /\b(AC|MG|SK)[0-9a-f]{32}\b/],
        ["OpenAI key", /\bsk-[A-Za-z0-9_-]{16,}/],
        ["connection string with password", /postgres(ql)?:\/\/[^\s:@/]+:[^\s@/]+@/],
        ["KEY=value assignment", /\b[A-Z][A-Z0-9_]{3,}=(?!production\b|staging\b|preview\b)[^\s`|]+/],
    ];
    for (const [name, re] of shapes) assert.doesNotMatch(text, re, name);
});

test("scanner: each detection rule, on a fixture tree", () => {
    const root = mkdtempSync(join(tmpdir(), "settings-inventory-"));
    try {
        const put = (rel, body) => {
            mkdirSync(dirname(join(root, rel)), { recursive: true });
            writeFileSync(join(root, rel), body);
        };
        put("web/lib/a.ts", 'const a = process.env.DIRECT_KEY; const b = process.env["BRACKET_KEY"];\n');
        put("web/lib/b.ts", "export function f(env = process.env) { return env.PARAM_KEY; }\n");
        put("web/lib/c.ts", 'const NAME = "INDIRECT_KEY";\nconst v = process.env[NAME];\nconst code = "PENDING";\n');
        put("web/lib/d.ts", 'const ref = "env:REF_KEY";\n');
        put("web/lib/skip.test.ts", "process.env.TEST_ONLY_KEY;\n");
        put("web/tests/e.ts", "process.env.TEST_DIR_KEY;\n");
        put("web/lib/f.ts", "const z = process.env.ONLY_DIRECT_KEY;\n");
        put("backend/app/s.py", 'import os\nX = os.getenv("PY_KEY")\nY = os.environ.get("PY_KEY_2")\n');
        put("supabase/migrations/1_x.sql", "create extension if not exists pg_cron;\nselect decrypted_secret from vault.decrypted_secrets where name = 'wake_url';\n");
        const inv = scanSettings(root);
        const ids = [...inv.keys()].sort();
        assert.deepEqual(ids, [
            "backend:PY_KEY",
            "backend:PY_KEY_2",
            "supabase:extension:pg_cron",
            "supabase:wake_url",
            "web:BRACKET_KEY",
            "web:DIRECT_KEY",
            "web:INDIRECT_KEY",
            "web:ONLY_DIRECT_KEY",
            "web:PARAM_KEY",
            "web:REF_KEY",
        ]);
        assert.deepEqual([...inv.get("web:INDIRECT_KEY").kinds], ["indirect"]);
        assert.deepEqual([...inv.get("web:PARAM_KEY").kinds], ["env-param"]);
        assert.deepEqual([...inv.get("web:ONLY_DIRECT_KEY").kinds], ["direct"], "process.env.X is not also env-param");
        assert.deepEqual([...inv.get("web:REF_KEY").kinds], ["secret-ref"]);
        assert.deepEqual(inv.get("web:DIRECT_KEY").refs, [{ file: "web/lib/a.ts", line: 1 }]);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
