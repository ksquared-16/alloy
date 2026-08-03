/**
 * S12 / G1–G2 — structural boundary.
 *
 * The doctrine's "AI prohibited" class — authorization, execution, permissions,
 * business truth, validation, record ownership — is only a convention unless
 * something enforces it. This test enforces it.
 *
 * It reads the source tree directly rather than the module graph, so a
 * violating import fails even if nothing exercises it at runtime.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

const WEB_ROOT = join(__dirname, "..", "..");

/** Directories that must never reach into the Trust Platform. */
const FORBIDDEN_CONSUMERS = [
    "lib/objective",
    "lib/adminV2/actions",
    "lib/relationships",
    "lib/opportunities/opportunityAttentionResolver.ts",
];

/** Tables the Trust Runtime is allowed to write. Anything else is a mutation. */
const TRUST_WRITABLE_TABLES = [
    "trust_decision_contracts",
    "trust_decision_packages",
    "trust_decision_observations",
    "trust_reasoning_usage",
    // workflow_events is written through the shared emitEvent spine, not directly.
];

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const entry of entries) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            walk(full, out);
        } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
            out.push(full);
        }
    }
    return out;
}

function sourceFilesUnder(relative: string): string[] {
    const full = join(WEB_ROOT, relative);
    try {
        return statSync(full).isDirectory() ? walk(full) : [full];
    } catch {
        return [];
    }
}

describe("G1 — the prohibited boundary holds structurally", () => {
    for (const consumer of FORBIDDEN_CONSUMERS) {
        it(`${consumer} does not import lib/trust`, () => {
            const files = sourceFilesUnder(consumer);
            const violations = files.filter((f) => /from\s+"@\/lib\/trust/.test(readFileSync(f, "utf8")));
            expect(violations.map((v) => v.replace(WEB_ROOT, ""))).toEqual([]);
        });
    }

    it("finds the modules it claims to be checking", () => {
        // A boundary test that silently checks nothing is worse than no test.
        expect(sourceFilesUnder("lib/adminV2/actions").length).toBeGreaterThan(0);
    });
});

describe("G2 — lib/trust performs no durable mutation of any business table", () => {
    it("writes only to trust_ tables", () => {
        const files = sourceFilesUnder("lib/trust");
        expect(files.length).toBeGreaterThan(0);

        const offenders: string[] = [];
        for (const file of files) {
            const src = readFileSync(file, "utf8");
            for (const match of src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)) {
                const table = match[1]!;
                if (!TRUST_WRITABLE_TABLES.includes(table)) {
                    offenders.push(`${file.replace(WEB_ROOT, "")}: ${table}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("contains no update or delete against any table", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder("lib/trust")) {
            const src = readFileSync(file, "utf8");
            // `advanceContractLifecycle` is the single sanctioned update, and the
            // database restricts it to the lifecycle column alone.
            if (/\.delete\(\)/.test(src)) offenders.push(`${file.replace(WEB_ROOT, "")}: delete()`);
            const updates = [...src.matchAll(/\.update\(/g)].length;
            if (updates > 0 && !file.endsWith("trustDecisionRepository.ts")) {
                offenders.push(`${file.replace(WEB_ROOT, "")}: update()`);
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe("no provider traffic and no external egress", () => {
    it("lib/trust contains no network call and no provider SDK", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder("lib/trust")) {
            const src = readFileSync(file, "utf8");
            for (const pattern of [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /require\(\s*"https?"/, /from\s+"node:https?"/, /@anthropic-ai/, /\bopenai\b/i, /axios/]) {
                if (pattern.test(src)) offenders.push(`${file.replace(WEB_ROOT, "")}: ${pattern}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("lib/trust reads no provider credential from the environment", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder("lib/trust")) {
            const src = readFileSync(file, "utf8");
            for (const key of ["OPENAI_API_KEY", "OPENAI_MODEL", "OPENAI_BASE_URL", "ANTHROPIC_API_KEY"]) {
                if (src.includes(key)) offenders.push(`${file.replace(WEB_ROOT, "")}: ${key}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});

describe("C3 — no mutable lifecycle state on the Decision Package", () => {
    it("the migration declares no lifecycle column on trust_decision_packages", () => {
        const sql = readFileSync(
            join(WEB_ROOT, "..", "supabase", "migrations", "20260802090000_trust_runtime_v1_foundation.sql"),
            "utf8",
        );
        const start = sql.indexOf("CREATE TABLE IF NOT EXISTS public.trust_decision_packages");
        const end = sql.indexOf("COMMENT ON TABLE public.trust_decision_packages");
        expect(start).toBeGreaterThan(-1);
        const body = sql.slice(start, end);

        for (const forbidden of ["lifecycle_state", "accepted_at", "rejected_at", "overridden_at", "executed_at", "presented_at", "observed_at"]) {
            expect(body).not.toContain(forbidden);
        }
    });
});
