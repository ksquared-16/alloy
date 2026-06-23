import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Comms V2 Phase 1 / B4 — announcement route source contract.
 * Verifies the skeleton routes follow the admin pattern, scope by org_id, and
 * contain NO send/schedule/provider behavior. (Audience/fan-out arrive in B5–B7.)
 */

const ROUTES_DIR = join(process.cwd(), "app", "api", "admin", "communications", "announcements");
const ROUTE_FILES = [
    "route.ts",
    join("[id]", "route.ts"),
    join("[id]", "archive", "route.ts"),
    join("[id]", "targets", "route.ts"),
    join("[id]", "recipient-preview", "route.ts"),
];

function read(rel: string): string {
    const p = join(ROUTES_DIR, rel);
    expect(existsSync(p), `route exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

describe("B4 announcement routes — auth + org scoping + scope guards", () => {
    for (const rel of ROUTE_FILES) {
        describe(rel, () => {
            const src = read(rel);

            it("uses requireAdminOrOps -> getAdminContextCached -> createAdminClient", () => {
                expect(src).toMatch(/await requireAdminOrOps\(\)/);
                expect(src).toMatch(/getAdminContextCached\(\)/);
                expect(src).toMatch(/if \(!ctx\.ok\) return adminContextFailureResponse\(ctx\)/);
                expect(src).toMatch(/createAdminClient\(\)/);
            });

            it("scopes data access by org_id", () => {
                const hasEqOrg = /\.eq\("org_id", (ctx\.orgId|orgId)\)/.test(src);
                const hasInsertOrg = /org_id: ctx\.orgId/.test(src);
                expect(hasEqOrg || hasInsertOrg).toBe(true);
            });

            it("contains NO send / schedule / provider code", () => {
                // Match actual code/endpoints, not descriptive comments (which legitimately
                // say "no send", "no fan-out").
                expect(src).not.toMatch(/twilio|sendgrid|resend|webhook|10dlc/i);
                expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutbound/);
                expect(src).not.toMatch(/communication_scheduled_sends|claim_due_/);
                expect(src).not.toMatch(/["'`][^"'`]*\/send\b/);
            });
        });
    }

    it("create route inserts a draft and carries org_id", () => {
        const src = read("route.ts");
        expect(src).toMatch(/status: "draft"/);
        expect(src).toMatch(/org_id: ctx\.orgId/);
    });

    it("exposes schedule/cancel/recipient-preview, but NO direct send or legacy audience endpoint", () => {
        // B7 intentionally added schedule + cancel; recipient-preview is the audience path.
        expect(existsSync(join(ROUTES_DIR, "[id]", "schedule"))).toBe(true);
        expect(existsSync(join(ROUTES_DIR, "[id]", "cancel"))).toBe(true);
        expect(existsSync(join(ROUTES_DIR, "[id]", "recipient-preview"))).toBe(true);
        // There is no direct provider-send route, and no legacy "audience" endpoint
        // (audience resolution flows through recipient-preview + rule.audience_spec).
        expect(existsSync(join(ROUTES_DIR, "[id]", "send"))).toBe(false);
        expect(existsSync(join(ROUTES_DIR, "[id]", "audience-preview"))).toBe(false);
        expect(existsSync(join(ROUTES_DIR, "[id]", "audience"))).toBe(false);
    });

    it("schedule + cancel stay provider-gated (no executeCommunicationsSend, no provider SDKs)", () => {
        const schedule = read(join("[id]", "schedule", "route.ts"));
        const cancel = read(join("[id]", "cancel", "route.ts"));
        for (const src of [schedule, cancel]) {
            expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutbound/);
            expect(src).not.toMatch(/twilio|sendgrid|resend|webhook|10dlc/i);
        }
    });
});
