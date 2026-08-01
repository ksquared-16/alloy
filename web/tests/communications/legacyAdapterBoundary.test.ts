/**
 * Phase 1 Slice 1 — legacy adapter boundary.
 *
 * `executeCommunicationsSend` was renamed to
 * `executeLegacyCommunicationsSendAdapter` because two equally canonical-looking
 * send functions is the condition that let the old one quietly own policy.
 *
 * This test pins the caller list so a fourth one cannot appear unnoticed, and
 * pins the structural claims Slice 1 makes about the converged routes.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(join(ROOT, dir))) {
        const rel = join(dir, entry);
        if (entry === "node_modules" || entry === ".next") continue;
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
        else if (rel.endsWith(".ts") || rel.endsWith(".tsx")) out.push(rel);
    }
    return out;
}

/** Source with comments stripped — a mention in prose is not a call. */
const code = (p: string) =>
    read(p)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

const SOURCES = [...walk("app"), ...walk("lib")];

const ADAPTER = "lib/communications/executeLegacyCommunicationsSendAdapter.ts";

/** Exactly the callers documented in the adapter header. */
const ALLOWED_ADAPTER_CALLERS = [
    "app/api/admin/communications/family-note/route.ts",
    "lib/communications/communicationScheduledSendsService.ts",
];

describe("legacy adapter is bounded", () => {
    it("the old canonical-looking name is gone from live code", () => {
        for (const f of SOURCES) {
            expect(code(f), f).not.toMatch(/\bexecuteCommunicationsSend\b/);
        }
    });

    it("has exactly the documented callers — a fourth fails this test", () => {
        const callers = SOURCES.filter(
            (f) => f !== ADAPTER && /executeLegacyCommunicationsSendAdapter/.test(code(f))
        ).sort();
        expect(callers).toEqual([...ALLOWED_ADAPTER_CALLERS].sort());
    });

    it("documents a removal condition for every retained caller", () => {
        const header = read(ADAPTER);
        for (const caller of ALLOWED_ADAPTER_CALLERS) {
            expect(header, caller).toContain(caller);
        }
        expect(header).toMatch(/Removal condition/i);
        expect(header).toMatch(/not canonical/i);
    });
});

describe("converged provider-bound routes use the canonical send command", () => {
    const CONVERGED = [
        "app/api/admin/communications/send/route.ts",
        "app/api/admin/communications/family-send/route.ts",
        "app/api/admin/ai/task-assist/apply/route.ts",
        "app/api/admin/opportunities/[id]/form-deliver/route.ts",
    ];

    it("each calls canonicalSend", () => {
        for (const f of CONVERGED) expect(code(f), f).toMatch(/canonicalSend\(/);
    });

    it("none still calls the legacy adapter", () => {
        for (const f of CONVERGED) {
            expect(code(f), f).not.toMatch(/executeLegacyCommunicationsSendAdapter/);
        }
    });

    it("each supplies explicit audience, category and purpose — nothing is inferred", () => {
        for (const f of CONVERGED) {
            const src = code(f);
            expect(src, `${f}: audience`).toMatch(/audience:\s*"(external|internal)"/);
            // Two legitimate shapes: a route that owns its category states a
            // literal; a route that accepts the operator's choice passes a
            // validated variable and REJECTS a missing one. Both are explicit —
            // what neither may do is default silently.
            const literalCategory = /category:\s*"(transactional|operational|marketing|emergency)"/.test(src);
            const validatedCategory = /(^|\s)category\s*,/m.test(src) && /missing_category/.test(src);
            expect(literalCategory || validatedCategory, `${f}: category is explicit`).toBe(true);
            expect(src, `${f}: purpose`).toMatch(/purpose:\s*"[a-z_]+"/);
        }
    });

    it("no converged route defaults a missing category", () => {
        for (const f of CONVERGED) {
            const src = code(f);
            if (!/(^|\s)category\s*,/m.test(src)) continue;
            // A route reading the category from the request must reject absence.
            expect(src, `${f} must reject a missing category`).toMatch(/missing_category/);
        }
    });

    it("each supplies an idempotency key", () => {
        for (const f of CONVERGED) expect(code(f), f).toMatch(/idempotencyKey:/);
    });
});

describe("no application route reaches a provider or inserts a message directly", () => {
    const ROUTES = SOURCES.filter((f) => f.startsWith("app/api/") && f.endsWith("route.ts"));

    it("no route imports a provider adapter", () => {
        for (const f of ROUTES) {
            expect(code(f), f).not.toMatch(/providers\/(twilioSmsAdapter|resendEmailAdapter)/);
        }
    });

    it("no route inserts into communication_messages", () => {
        for (const f of ROUTES) {
            const src = code(f);
            if (!/communication_messages/.test(src)) continue;
            expect(src, `${f} inserts into communication_messages`).not.toMatch(
                /from\(\s*"communication_messages"\s*\)[\s\S]{0,80}\.insert\(/
            );
        }
    });
});

describe("family-note stays an internal activity fact", () => {
    it("uses in_app and supplies no external recipient", () => {
        const src = code("app/api/admin/communications/family-note/route.ts");
        expect(src).toMatch(/channel:\s*"in_app"/);
        expect(src).toMatch(/toRawInput:\s*""/);
        expect(src).toMatch(/recipientPersonIdRaw:\s*""/);
    });
});

describe("form-deliver keeps link generation out of the provider path", () => {
    it("returns before any send when channel is link", () => {
        const src = code("app/api/admin/opportunities/[id]/form-deliver/route.ts");
        const linkBranch = src.indexOf('if (channel === "link")');
        const firstSend = src.indexOf("canonicalSend(");
        expect(linkBranch).toBeGreaterThan(-1);
        expect(firstSend).toBeGreaterThan(-1);
        // The link branch returns before the send loop is ever reached.
        expect(linkBranch).toBeLessThan(firstSend);
    });
});
