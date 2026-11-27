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
const BRIEFING = "docs/platform/runtime/environments-p1s-first-promotion-briefing-2026-11-25.md";
const FINAL_PLAN = "docs/platform/runtime/environments-final-cutover-plan-2026-11-26.md";
const RELEASE_CONFIG = JSON.parse(readFileSync(join(REPO_ROOT, "scripts/release/release-config.json"), "utf8"));
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

const CREDENTIAL_SHAPES = [
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

test("the checklist contains no credential-shaped value", () => {
    const text = readFileSync(join(REPO_ROOT, CHECKLIST), "utf8");
    for (const [name, re] of CREDENTIAL_SHAPES) assert.doesNotMatch(text, re, name);
});

test("the first-promotion briefing: no credential, every settled decision, no dangling label", () => {
    const text = readFileSync(join(REPO_ROOT, BRIEFING), "utf8");
    for (const [name, re] of CREDENTIAL_SHAPES) assert.doesNotMatch(text, re, name);
    const table = text.split("## Settled owner decisions")[1]?.split("\n## ")[0] ?? "";
    for (let i = 1; i <= 11; i++) assert.match(table, new RegExp(`^\\| \\*\\*D${i}\\*\\* \\|`, "m"), `D${i} is in the settled-decisions table`);
    assert.doesNotMatch(text, /\bOPEN-[A-Z]\b|\bD-[A-Z]\b|see report/, "a label that names no decision in this document");
    assert.doesNotMatch(text, /\b\d{1,2} (Nov|Dec)[a-z]*\b|\b(Nov|Dec)[a-z]* \d{1,2}\b|Tuesday|\b\d{2}:\d{2} (PT|UTC)\b/, "D8: the window is booked at step 6b, not fixed to a date");
});

test("the final cutover plan: no credential, the owner's window, every step and decision point, step 16 on the post-clock baseline", () => {
    const text = readFileSync(join(REPO_ROOT, FINAL_PLAN), "utf8");
    for (const [name, re] of CREDENTIAL_SHAPES) assert.doesNotMatch(text, re, name);
    assert.doesNotMatch(text, /@[a-z0-9-]+\.[a-z]{2,}/i, "O-ADMIN: the owner's address is typed in the session, never written here");
    // O-WHEN (owner, 2026-11-25): Tue Dec 1 09:00–12:00 PT if 6b lands by Sun Nov 29, else Tue Dec 8. No other date.
    for (const d of ["Tue Dec 1", "Tue Dec 8", "Sun Nov 29", "09:00–12:00 PT"]) assert.ok(text.includes(d), d);
    const days = new Set([...text.matchAll(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]* (Nov|Dec) (\d{1,2})\b/g)].map((m) => `${m[1]} ${m[2]}`));
    for (const d of days) assert.ok(["Nov 27", "Nov 28", "Nov 29", "Dec 1", "Dec 8"].includes(d), `unexpected date ${d}`);
    assert.doesNotMatch(text, /no calendar date is fixed|booked at (step )?6b|date is booked/i, "O-WHEN: the date is decided, not booked at 6b");
    const statusNote = text.match(/^status_note: (.*)$/m)?.[1] ?? "";
    for (const d of ["Tue Dec 1, 09:00–12:00 PT", "Sun Nov 29", "Tue Dec 8, 09:00–12:00 PT"]) assert.ok(statusNote.includes(d), `status_note states ${d}`);
    for (const o of ["O-BACKUPS", "O-ADMIN", "O-WHEN", "D11", "D12", "O-LANES", "O-ROOMS"]) assert.match(text, new RegExp(`^\\| \\*\\*${o}\\*\\* \\|`, "m"), o);
    // D11/D12 (owner, 2026-11-26): Claude Code is the operator in the owner's session; the owner approves each command,
    // pastes secrets at a hidden prompt, never types commands, and does every dashboard step from the owner guide.
    assert.doesNotMatch(text, /<operator-name>|\*\*Name the operator\*\*/, "D12: the operator is decided, not a placeholder");
    assert.match(text, /^\| \*\*D12\*\* \|[^\n]*The operator is Claude Code\*\*, running in the owner's own operator session on the Mac mini[^\n]*approves each command before it runs[^\n]*transcript is recorded/m, "D12 names the operator, the approval and the transcript");
    assert.match(text, /^\| \*\*D11\*\* \|[^\n]*The owner never types commands[^\n]*hidden prompt \(`read -rs`\)[^\n]*Database Engineer's review/m, "D11: no typed commands, the hidden prompt, the Database Engineer's review");
    assert.match(text, /^\| 2:25 \| \*\*16\*\* \| Operator: Claude Code \(D12\), each command only after the owner approves it \(D11\)/m, "step 16 is Claude Code's, per approved command");
    for (const rule of ["**The per-command approval rule (D11, D12).**", "**The secret-entry rule (D11).**"]) assert.ok(text.includes(rule), rule);
    assert.ok(text.includes("never written to a file, never typed or pasted into a command line, and\nnever shown to Claude"), "the secret-entry rule");
    assert.ok(text.includes("environments-owner-dashboard-guide-2026-11-26.md"), "the plan names the owner dashboard guide");
    // O-BACKUPS (owner, 2026-11-26, replacing O-PITR) and O-ADMIN are decided, not open: daily backups kept 7 days, no
    // PITR until the first tenant with live customer data; a restore can lose up to a day.
    assert.match(text, /^\| \*\*O-BACKUPS\*\* \|[^\n]*daily backups, kept 7 days[^\n]*No point-in-time recovery[^\n]*can lose up to a day[^\n]*before the first tenant with live customer data/m, "O-BACKUPS: daily, 7 days, no PITR, the follow-up");
    // O-READONLY (owner, 2026-11-26): alloy_readonly keeps BYPASSRLS by explicit exception, never writes, and is switched
    // off or narrowed on production before the first tenant with live customer data. The step-5 decision is closed.
    assert.match(text, /^\| \*\*O-READONLY\*\* \|[^\n]*BYPASSRLS[^\n]*every tenant's rows[^\n]*never allows:\*\* a write[^\n]*owner's secret store[^\n]*before the first tenant with live customer data/m, "O-READONLY: who, what it allows, what it never allows, the follow-up");
    assert.doesNotMatch(text, /Open, owner decision before step 6/, "the step-5 read-path decision is closed");
    const roleSql = readFileSync(join(REPO_ROOT, "docs/platform/runtime/environments-readonly-role-2026-11-27.sql"), "utf8");
    assert.match(roleSql, /^alter role alloy_readonly with login [^\n]* bypassrls connection limit 5;$/m, "the role script gives BYPASSRLS");
    assert.ok(roleSql.includes("alter role alloy_readonly set row_security = off;"), "row_security stays off: a missing BYPASSRLS fails loudly");
    assert.match(roleSql, /and not r\.rolreplication and r\.rolbypassrls and r\.rolconnlimit = 5/, "check row 1 requires BYPASSRLS");
    const step5 = text.match(/^\| \*\*5\*\* \|[^\n]*$/m)?.[0] ?? "";
    for (const p of ["daily backups, kept 7 days (O-BACKUPS)", "**`tjziptdknxdajzauctha`**", "**`us-west-2`**", "**Resend**", "environments-readonly-role-2026-11-27.sql", "`previous_supabase_project_ref` `vslwnntzzgpnmrpjipat`"]) assert.ok(step5.includes(p), `step 5: ${p}`);
    assert.doesNotMatch(text, /enable PITR|7-day PITR restore|with PITR again|paid add-on/, "no PITR step, PITR restore or add-on is left");
    assert.doesNotMatch(text, /name Firefly's first admin|choose its backup/i, "neither the first admin nor the backup tier is still open");
    for (const p of ["<admin-user-id>", "<admin-email>", "owner's own existing Auth account", "invites Firefly's staff"]) assert.ok(text.includes(p), p);
    assert.ok(text.includes("17 later rooms") && text.includes("Work Unit Queue"), "rooms at the export review; lanes after step 16");
    assert.ok(text.includes("No required check runs that test file"), "serviceClientPrincipalCheck: not a required check on the candidate");
    for (const g of ["(a) Owner dashboard actions", "(b) Owner-approved repository steps", "(c) Owner answers", "(d) Anything else"]) assert.ok(text.includes(`**${g}**`), g);
    for (const c of RELEASE_CONFIG.required_checks) assert.ok(text.includes(`\`${c}\``), `step 4 names required check ${c}`);
    const window = text.split("### 2.2 The window")[1]?.split("\n## ")[0] ?? "";
    for (const step of ["7", "8", "9", "10", "11", "12", "13", "14", "15", "15b", "16", "16L", "17"]) {
        assert.match(window, new RegExp(`^\\| [0-9:]+[^|]*\\| \\*\\*${step}\\*\\* \\|`, "m"), `window step ${step} has a T+ row`);
    }
    for (const point of ["GO/NO-GO 1", "HOLD point", "KEEP / ROLL BACK", "STOP point"]) assert.ok(window.includes(`**${point}**`), point);
    const before = text.split("### 2.1 Before the window")[1]?.split("### 2.2")[0] ?? "";
    for (const step of ["1", "2", "3", "4", "5", "6", "6b"]) assert.match(before, new RegExp(`^\\| \\*\\*${step}\\*\\* \\|`, "m"), `step ${step}`);
    assert.match(before, /^\| \*\*Nov 29\*\* \| \*\*GO\/NO-GO 0\*\*[^\n]*Tue Dec 1, 09:00 PT[^\n]*Tue Dec 8, 09:00 PT/m, "the Nov 29 go/no-go selects Dec 1 or Dec 8");
    for (const r of ["R-A", "R-B", "R-C", "R-D"]) assert.ok(text.includes(`**${r},`), `rollback point ${r}`);
    assert.match(text, /--baseline "\$DIR\/census-before-step16\.txt"/, "16.6 verifies against the post-clock baseline");
    const briefing = readFileSync(join(REPO_ROOT, BRIEFING), "utf8");
    assert.doesNotMatch(briefing, /--baseline "\$DIR\/census-extras\.txt"/, "the briefing no longer verifies step 16 against step 9's census");
    assert.ok(briefing.includes("environments-final-cutover-plan-2026-11-26.md"), "the briefing names the final plan");
    assert.match(briefing, /^\| \*\*M7\*\* \|[^\n]*daily backups, kept 7 days, no PITR[^\n]*before the first tenant with live customer data/m, "briefing M7: daily backups decided, PITR later");
    assert.doesNotMatch(briefing, /7-day PITR \(step 5\)|enable PITR/, "the briefing no longer relies on PITR");
    const guide = readFileSync(join(REPO_ROOT, "docs/platform/runtime/environments-owner-dashboard-guide-2026-11-26.md"), "utf8");
    for (const [name, re] of CREDENTIAL_SHAPES) assert.doesNotMatch(guide, re, `guide: ${name}`);
    assert.doesNotMatch(guide, /Turn on point-in-time recovery|does not hold that statement yet/, "the guide has no PITR step and holds the role statement");
    for (const p of ["environments-readonly-role-2026-11-27.sql", "Database → Roles", "Reset password", "never** in the SQL Editor", "alloy_readonly.tjziptdknxdajzauctha", "permission denied for schema supabase_migrations", "Your exception (2026-11-26, plan O-READONLY)", "**Known limit", "select count(*) from public.orgs"]) assert.ok(guide.includes(p), `guide: ${p}`);
    assert.doesNotMatch(briefing, /backup\/PITR tier|name Firefly's first admin|the owner named at step 6/, "the briefing no longer holds the tier or the first admin open");
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
