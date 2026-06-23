import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
    buildStatusOptions,
    grainToEntityType,
    mapStatusDefinitionRowToOption,
    type StatusDefinitionRow,
} from "@/lib/communications/v2/statusOptions";

/** Comms V2 Phase 1 / B8C — status option endpoint (read-only, config-driven). */

describe("grainToEntityType", () => {
    it("maps family grain to opportunities", () => {
        expect(grainToEntityType("family")).toBe("opportunities");
    });
    it("maps child grain to opportunity_customer_members", () => {
        expect(grainToEntityType("child")).toBe("opportunity_customer_members");
    });
    it("rejects an invalid grain", () => {
        expect(grainToEntityType("person")).toBeNull();
        expect(grainToEntityType("")).toBeNull();
    });
});

describe("mapStatusDefinitionRowToOption", () => {
    it("passes through configured metadata fields when present", () => {
        const opt = mapStatusDefinitionRowToOption({
            org_id: "org",
            entity_type: "opportunity_customer_members",
            status_key: "waitlisted",
            status_label: "Waitlisted",
            metadata: { stage_key: "waitlist", status_settings_category: "enrollment_statuses", process_stage_key: "wl" },
        });
        expect(opt).toEqual({
            status_key: "waitlisted",
            label: "Waitlisted",
            entity_type: "opportunity_customer_members",
            stage_key: "waitlist",
            status_settings_category: "enrollment_statuses",
            process_stage_key: "wl",
        });
    });
    it("omits absent metadata fields and falls back label to status_key", () => {
        const opt = mapStatusDefinitionRowToOption({ org_id: null, entity_type: "opportunities", status_key: "open", status_label: null, metadata: {} });
        expect(opt).toEqual({ status_key: "open", label: "open", entity_type: "opportunities" });
        expect(opt.stage_key).toBeUndefined();
    });
});

describe("buildStatusOptions", () => {
    it("drops inactive rows and de-dupes preferring an org override over a default", () => {
        const rows: StatusDefinitionRow[] = [
            { org_id: null, entity_type: "opportunities", status_key: "open", status_label: "Open (default)", is_active: true },
            { org_id: "org", entity_type: "opportunities", status_key: "open", status_label: "Open (org)", is_active: true },
            { org_id: "org", entity_type: "opportunities", status_key: "closed", status_label: "Closed", is_active: false },
        ];
        const opts = buildStatusOptions(rows);
        expect(opts).toHaveLength(1);
        expect(opts[0].label).toBe("Open (org)"); // org override wins
    });
});

describe("status-options route — source contract", () => {
    function read(rel: string): string {
        const p = join(process.cwd(), rel);
        expect(existsSync(p), `exists: ${rel}`).toBe(true);
        return readFileSync(p, "utf8");
    }
    const SRC = read("app/api/admin/communications/status-options/route.ts");

    it("uses requireAdminOrOps -> getAdminContextCached -> createAdminClient", () => {
        expect(SRC).toMatch(/await requireAdminOrOps\(\)/);
        expect(SRC).toMatch(/getAdminContextCached\(\)/);
        expect(SRC).toMatch(/if \(!ctx\.ok\) return adminContextFailureResponse\(ctx\)/);
        expect(SRC).toMatch(/createAdminClient\(\)/);
    });

    it("queries status_definitions and scopes by org_id", () => {
        expect(SRC).toMatch(/\.from\("status_definitions"\)/);
        expect(SRC).toMatch(/org_id\.eq\.\$\{orgId\}/);
    });

    it("returns only active configured statuses for the grain's authoritative entity_type", () => {
        expect(SRC).toContain("grainToEntityType");
        expect(SRC).toMatch(/\.eq\("entity_type", entityType\)/);
        expect(SRC).toMatch(/\.eq\("is_active", true\)/);
    });

    it("does NOT use pipeline_stages or legacy opportunities.status (actual table/column access)", () => {
        expect(SRC).not.toMatch(/\.from\("pipeline_stages"\)/);
        expect(SRC).not.toMatch(/\.from\("opportunities"\)/);
        expect(SRC).not.toMatch(/\.select\("status"\)|\.eq\("status",/);
    });

    it("contains no send / schedule / provider code", () => {
        expect(SRC).not.toMatch(/twilio|sendgrid|resend|webhook/i);
        expect(SRC).not.toMatch(/executeCommunicationsSend|communication_scheduled_sends|claim_due_/);
        expect(SRC).not.toMatch(/["'`][^"'`]*\/send\b/);
    });
});
