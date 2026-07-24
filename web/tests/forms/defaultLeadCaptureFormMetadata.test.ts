import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/forms/intake/resolveOrgIntakeRoutingDefaults", () => ({
    resolveOrgIntakeRoutingDefaults: vi.fn(async () => ({
        default_vertical_id: "vertical-1",
        default_location_id: null,
        default_work_unit_id: null,
        default_department_id: "dept-1",
    })),
}));

import { applyDefaultLeadCaptureFormMetadata } from "@/lib/forms/intake/defaultLeadCaptureFormMetadata";
import { resolveOrgIntakeRoutingDefaults } from "@/lib/forms/intake/resolveOrgIntakeRoutingDefaults";

const fakeSupabase = {} as unknown as SupabaseClient;

describe("applyDefaultLeadCaptureFormMetadata", () => {
    it("defaults a new lead-capture form to the enrollment_lead intent + Business Process context", async () => {
        const md = await applyDefaultLeadCaptureFormMetadata(fakeSupabase, "org-1", {
            source: "processing",
            origin: "blank",
        });
        // Operational intent — drives link routing (vertical) when a public link is minted.
        expect(md.intake_intent).toBe("enrollment_lead");
        // Business Process context — the enrollment "lead" stage on the resolved department.
        expect(md.lifecycle_usage_v1).toMatchObject({
            department_id: "dept-1",
            stage_key: "lead",
            intake_intent: "enrollment_lead",
        });
        // Existing metadata is preserved.
        expect(md.source).toBe("processing");
        expect(md.origin).toBe("blank");
    });

    it("preserves an explicitly provided operational intent (document/packet flows are untouched)", async () => {
        const md = await applyDefaultLeadCaptureFormMetadata(fakeSupabase, "org-1", {
            intake_intent: "operational_document",
        });
        expect(md.intake_intent).toBe("operational_document");
        expect(md.lifecycle_usage_v1).toBeUndefined();
    });

    it("still sets the intent when no department resolves (Business Process is best-effort)", async () => {
        vi.mocked(resolveOrgIntakeRoutingDefaults).mockResolvedValueOnce({
            default_vertical_id: null,
            default_location_id: null,
            default_work_unit_id: null,
            default_department_id: null,
        });
        const md = await applyDefaultLeadCaptureFormMetadata(fakeSupabase, "org-1", {});
        expect(md.intake_intent).toBe("enrollment_lead");
        expect(md.lifecycle_usage_v1).toBeUndefined();
    });
});
