import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { audiencePreviewResponse, type AudiencePreview } from "@/lib/communications/v2/audienceSpec";

/** Comms V2 Phase 1 / B8D — recipient-preview shape rewired to the audience_spec model. */

function basePreview(over: Partial<AudiencePreview> = {}): AudiencePreview {
    return {
        grain: "families",
        total_families: 0,
        matched_children: null,
        per_filter: [],
        counts_by_channel: { email: 0, sms: 0, in_app: 0, messageable: 0 },
        excluded: { opted_out: 0 },
        unresolved: [],
        sample_recipients: [],
        capped: false,
        ...over,
    };
}

describe("audiencePreviewResponse (new shape)", () => {
    it("maps families-grain preview: matched_families, total_recipients, resolved per_filter", () => {
        const r = audiencePreviewResponse(
            basePreview({
                grain: "families",
                total_families: 12,
                counts_by_channel: { email: 9, sms: 7, in_app: 10, messageable: 10 },
                per_filter: [{ kind: "family_status", status: "resolved", family_count: 12, detail: "ok" }],
            })
        );
        expect(r.grain).toBe("families");
        expect(r.matched_families).toBe(12);
        expect(r.total_recipients).toBe(10); // = messageable
        expect(r).not.toHaveProperty("matched_children"); // families grain omits it
        expect(r.per_filter).toEqual([{ kind: "family_status", status: "resolved", count: 12 }]);
        expect(r.unresolved).toEqual([]);
    });

    it("includes matched_children for grain='children'", () => {
        const r = audiencePreviewResponse(
            basePreview({
                grain: "children",
                total_families: 5,
                matched_children: 8,
                per_filter: [{ kind: "child_enrollment_status", status: "resolved", family_count: 5, detail: "" }],
            })
        );
        expect(r.grain).toBe("children");
        expect(r.matched_children).toBe(8);
        expect(r.matched_families).toBe(5);
    });

    it("surfaces room (and any) unresolved filters with a reason", () => {
        const r = audiencePreviewResponse(
            basePreview({
                per_filter: [{ kind: "room", status: "unresolved", family_count: 0, detail: "room targeting needs a safe option endpoint" }],
            })
        );
        expect(r.per_filter[0]).toEqual({ kind: "room", status: "unresolved", reason: "room targeting needs a safe option endpoint" });
        expect(r.unresolved).toHaveLength(1);
    });

    it("total_recipients is 0 when channel counts degraded to null", () => {
        const r = audiencePreviewResponse(basePreview({ counts_by_channel: null }));
        expect(r.total_recipients).toBe(0);
        expect(r.counts_by_channel).toBeNull();
    });

    it("empty filters preview = all families (intentional), still new shape", () => {
        const r = audiencePreviewResponse(basePreview({ total_families: 100, counts_by_channel: { email: 80, sms: 60, in_app: 90, messageable: 90 } }));
        expect(r.per_filter).toEqual([]);
        expect(r.matched_families).toBe(100);
        expect(r.total_recipients).toBe(90);
    });
});

describe("recipient-preview route — source contract (B8D)", () => {
    function read(rel: string): string {
        const p = join(process.cwd(), rel);
        expect(existsSync(p), `exists: ${rel}`).toBe(true);
        return readFileSync(p, "utf8");
    }
    const SRC = read("app/api/admin/communications/announcements/[id]/recipient-preview/route.ts");

    it("resolves via the spec engine and returns the new shape", () => {
        expect(SRC).toContain("resolveTargetsToSpec");
        expect(SRC).toContain("resolveAudienceSpec");
        expect(SRC).toContain("audiencePreviewResponse");
        // legacy bucket resolver is no longer CALLED (the module filename in the import path is fine)
        expect(SRC).not.toMatch(/resolveAnnouncementAudience\(/);
    });

    it("reads rule.audience_spec and errors (not all families) on a missing/invalid custom spec", () => {
        expect(SRC).toMatch(/\.select\("target_type, target_ref, rule"\)/);
        expect(SRC).toContain("rule: t.rule");
        expect(SRC).toMatch(/if \(!specRes\.ok\) return NextResponse\.json\(\{ error: specRes\.error \}, \{ status: 400 \}\)/);
    });

    it("admin pattern + org scoped, no provider/send/schedule, no legacy enrollment sources", () => {
        expect(SRC).toMatch(/await requireAdminOrOps\(\)/);
        expect(SRC).toMatch(/if \(!ctx\.ok\) return adminContextFailureResponse\(ctx\)/);
        expect(SRC).toMatch(/\.eq\("org_id", orgId\)/);
        expect(SRC).not.toMatch(/twilio|sendgrid|resend|webhook/i);
        expect(SRC).not.toMatch(/executeCommunicationsSend|communication_scheduled_sends|claim_due_/);
        expect(SRC).not.toMatch(/["'`][^"'`]*\/send\b/);
        expect(SRC).not.toMatch(/\.from\("pipeline_stages"\)|\.from\("opportunities"\)/);
        expect(SRC).not.toMatch(/customers"\)[\s\S]{0,60}status_key/);
        // (status resolution + the keyword-matching doctrine are enforced on the loader, not this
        //  delegating route, which only uses UUID_RE.test for id validation.)
    });
});
