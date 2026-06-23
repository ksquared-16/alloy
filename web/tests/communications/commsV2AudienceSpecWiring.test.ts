import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { audienceSpecToRule, resolveTargetsToSpec } from "@/lib/communications/v2/audienceSpec";

/**
 * Comms V2 Phase 1 / B8B — audience_spec wired into preview + schedule paths.
 * Proves a custom row resolves through the spec engine and that a missing/invalid
 * custom spec NEVER broadens to all families.
 */

const UUID = "11111111-1111-4111-8111-111111111111";

function read(rel: string): string {
    const p = join(process.cwd(), rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

describe("resolveTargetsToSpec — strict custom resolution", () => {
    it("custom with child_enrollment_status resolves through the spec engine", () => {
        const spec = { grain: "children" as const, filters: [{ kind: "child_enrollment_status" as const, status_keys: ["enrolled"] }] };
        const r = resolveTargetsToSpec([{ target_type: "custom", target_ref: null, rule: audienceSpecToRule(spec) }]);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.spec).toEqual(spec);
    });

    it("custom with EMPTY filters resolves all families intentionally", () => {
        const spec = { grain: "families" as const, filters: [] };
        const r = resolveTargetsToSpec([{ target_type: "custom", target_ref: null, rule: audienceSpecToRule(spec) }]);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.spec.filters).toEqual([]); // intentional all-families
    });

    it("custom missing rule.audience_spec returns an ERROR — never all families", () => {
        expect(resolveTargetsToSpec([{ target_type: "custom", target_ref: null, rule: null }]).ok).toBe(false);
        expect(resolveTargetsToSpec([{ target_type: "custom", target_ref: null, rule: {} }]).ok).toBe(false);
        expect(resolveTargetsToSpec([{ target_type: "custom", target_ref: null }]).ok).toBe(false);
    });

    it("custom with malformed spec returns an ERROR — never all families", () => {
        const r = resolveTargetsToSpec([{ target_type: "custom", target_ref: null, rule: { audience_spec: { grain: "people" } } }]);
        expect(r.ok).toBe(false);
    });

    it("no targets returns an error (does not broaden)", () => {
        expect(resolveTargetsToSpec([]).ok).toBe(false);
    });

    it("a custom row wins over legacy rows", () => {
        const spec = { grain: "families" as const, filters: [{ kind: "location" as const, location_ids: [UUID] }] };
        const r = resolveTargetsToSpec([
            { target_type: "program", target_ref: UUID },
            { target_type: "custom", target_ref: null, rule: audienceSpecToRule(spec) },
        ]);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.spec).toEqual(spec); // program legacy ignored when custom present
    });

    it("legacy-only rows still map via the adapter (fallback)", () => {
        const r = resolveTargetsToSpec([{ target_type: "location", target_ref: UUID }]);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.spec.filters).toEqual([{ kind: "location", location_ids: [UUID] }]);
    });
});

describe("preview route + schedule service wiring (source contract)", () => {
    const ROUTE = read("app/api/admin/communications/announcements/[id]/recipient-preview/route.ts");
    const SCHED = read("lib/communications/v2/scheduleAnnouncementSendout.ts");

    it("recipient-preview route reads + passes rule (audience_spec)", () => {
        expect(ROUTE).toMatch(/\.select\("target_type, target_ref, rule"\)/);
        expect(ROUTE).toMatch(/rule: (t\.rule|row\.rule)/);
    });

    it("schedule service resolves via rule.audience_spec, not the broad legacy path", () => {
        expect(SCHED).toMatch(/\.select\("target_type, target_ref, rule"\)/);
        expect(SCHED).toContain("resolveTargetsToSpec");
        expect(SCHED).toContain("listAnnouncementRecipientPersonsForSpec");
        // no longer uses the broad legacy resolver / adapter
        expect(SCHED).not.toMatch(/listAnnouncementRecipientPersons\b\(/);
        expect(SCHED).not.toContain("legacyTargetsToSpec");
        // a missing/invalid spec errors rather than scheduling all families
        expect(SCHED).toMatch(/if \(!specRes\.ok\) return fail\(400, specRes\.error\)/);
    });

    it("schedule fan-out + provider gating is unchanged (no provider/send changes)", () => {
        expect(SCHED).toContain("planAnnouncementFanout");
        expect(SCHED).toContain("communication_scheduled_sends");
        expect(SCHED).not.toMatch(/twilio|sendgrid|resend|webhook/i);
        expect(SCHED).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutbound/);
    });
});
