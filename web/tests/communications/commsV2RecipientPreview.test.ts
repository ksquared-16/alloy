import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Comms V2 Phase 1 / B6 — recipient-preview route + loader contract.
 * Guarantees the audience resolution path is READ-ONLY, org-scoped, and never
 * writes recipients / sends / schedules / touches a provider.
 */

function read(rel: string): string {
    const p = join(process.cwd(), rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

const ROUTE = read("app/api/admin/communications/announcements/[id]/recipient-preview/route.ts");
const LOADER = read("lib/communications/v2/resolveAnnouncementAudience.ts");

describe("recipient-preview route", () => {
    it("uses the admin pattern and is org-scoped", () => {
        expect(ROUTE).toMatch(/await requireAdminOrOps\(\)/);
        expect(ROUTE).toMatch(/getAdminContextCached\(\)/);
        expect(ROUTE).toMatch(/if \(!ctx\.ok\) return adminContextFailureResponse\(ctx\)/);
        expect(ROUTE).toMatch(/\.eq\("org_id", orgId\)/);
    });

    it("is READ-ONLY (no writes, no recipient snapshot)", () => {
        for (const src of [ROUTE, LOADER]) {
            expect(src).not.toMatch(/\.insert\(/);
            expect(src).not.toMatch(/\.update\(/);
            expect(src).not.toMatch(/\.delete\(/);
            expect(src).not.toMatch(/\.upsert\(/);
            // no actual access to the recipient-snapshot table (the words may appear in comments)
            expect(src).not.toMatch(/\.from\("announcement_recipients"\)/);
        }
    });

    it("never sends / schedules / touches a provider", () => {
        for (const src of [ROUTE, LOADER]) {
            expect(src).not.toMatch(/twilio|sendgrid|resend|webhook|10dlc/i);
            expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutbound/);
            expect(src).not.toMatch(/communication_scheduled_sends|claim_due_/);
            expect(src).not.toMatch(/["'`][^"'`]*\/send\b/);
        }
    });
});

describe("audience loader", () => {
    it("scopes every table read by org_id", () => {
        const fromCount = (LOADER.match(/\.from\("/g) ?? []).length;
        const eqOrgCount = (LOADER.match(/\.eq\("org_id", orgId\)/g) ?? []).length;
        expect(fromCount).toBeGreaterThan(0);
        expect(eqOrgCount).toBeGreaterThanOrEqual(fromCount);
    });

    it("reads only the expected CRM + comms tables", () => {
        const tables = [...LOADER.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]);
        const allowed = new Set([
            "customers",
            "customer_persons",
            "persons",
            "opportunities",
            "opportunity_customer_members",
            "communication_preferences",
        ]);
        for (const t of tables) expect(allowed.has(t), `unexpected table read: ${t}`).toBe(true);
    });

    it("only uses SELECT-style reads", () => {
        expect(LOADER).toContain(".select(");
        expect(LOADER).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    });

    it("B8A doctrine: no pipeline_stages, no legacy opportunities.status, no customers.status_key, no keyword/bucket branches", () => {
        // pipeline_stages must never back announcement audience resolution
        expect(LOADER).not.toMatch(/pipeline_stage/);
        // child-enrollment uses outcome_status_key; family uses status_key — never legacy 'status' text
        expect(LOADER).not.toMatch(/\.select\("status"\)/);
        expect(LOADER).not.toMatch(/\.eq\("status",/);
        // customers.status_key is never used as enrollment truth (customers is selected for id/name only)
        expect(LOADER).not.toMatch(/customers"\)[\s\S]{0,60}status_key/);
        // no keyword/label matching (no regex .test on labels) and no fixed-bucket resolver branches
        expect(LOADER).not.toMatch(/\.test\(/);
        expect(LOADER).not.toMatch(/WAITLIST_RE|ACTIVE_RE|selectStatusKeysForGroup|stage_key/);
        expect(LOADER).not.toMatch(/target_type === "(active_families|waitlist)"/);
        // canonical child enrollment column is used
        expect(LOADER).toMatch(/\.in\("outcome_status_key",/);
    });
});
