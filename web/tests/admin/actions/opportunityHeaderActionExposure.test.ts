import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { UNIVERSAL_ACTION_VISIBLE_STATUS_KEYS } from "@/lib/admin/actions/universalActionConstants";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("opportunity header action exposure doctrine", () => {
    it("migration deactivates universal default record_header placements", () => {
        const migration = readFileSync(
            resolve(webRoot, "../supabase/migrations/20260602210000_fix_opportunity_header_action_overexposure.sql"),
            "utf8"
        );
        for (const key of ["send_email", "send_sms", "call_parent", "send_form", "upload_document"]) {
            expect(migration).toContain(`'${key}'`);
        }
        expect(migration).toContain("is_active = false");
        expect(migration).toContain("add_family_member");
        expect(migration).toContain("update_status_add_note");
    });

    it("universal action definitions remain in catalog (capabilities not deleted)", () => {
        const migration = readFileSync(
            resolve(webRoot, "../supabase/migrations/20260602180000_phase1b_qualification_status_and_universal_actions.sql"),
            "utf8"
        );
        expect(migration).toContain("'send_email'");
        expect(migration).not.toMatch(/DELETE FROM public\.action_definitions[\s\S]*send_email/);
    });

    it("Work with BOS and Actions share drawer header controls row", () => {
        const controls = read("components/admin/opportunity/OpportunityDrawerHeaderControls.tsx");
        expect(controls).toContain("BosDrawerAssistCta");
        expect(controls).toContain("OpportunityDrawerHeaderActionsMenu");
        expect(controls).not.toContain("OpportunityDrawerHeaderActionsPanel");
    });

    it("registry client still routes universal actions for non-header surfaces", () => {
        const client = read("lib/admin/actions/applyRegistryResolvedActionClient.ts");
        expect(client).toContain("send_email");
        expect(client).toContain("send_sms");
        expect(client).toContain("call_parent");
        expect(client).toContain("upload_document");
    });

    it("documents universal action status keys exist for resolver conditions", () => {
        expect(UNIVERSAL_ACTION_VISIBLE_STATUS_KEYS.length).toBeGreaterThan(0);
    });
});

describe("default header actions by lifecycle stage (after overexposure fix)", () => {
    const stages: Record<string, string[]> = {
        new_inquiry: ["move_to_qualification", "schedule_tour", "mark_lost"],
        qualification: ["schedule_tour", "mark_lost"],
        contact_attempted: ["schedule_tour", "mark_lost"],
        waitlisted: ["schedule_tour", "mark_lost"],
        tour_scheduled: [
            "schedule_tour",
            "reschedule_tour",
            "confirm_tour",
            "record_tour_outcome",
            "send_enrollment_packet",
            "mark_lost",
        ],
        tour_completed: [
            "reschedule_tour",
            "confirm_tour",
            "record_tour_outcome",
            "send_enrollment_packet",
            "review_enrollment_packet",
            "request_missing_information",
            "mark_lost",
        ],
        enrolling: ["send_enrollment_packet", "review_enrollment_packet", "request_missing_information", "mark_lost"],
    };

    it("documents expected lifecycle header keys (not universal comms)", () => {
        const all = new Set(Object.values(stages).flat());
        expect(all.has("send_email")).toBe(false);
        expect(all.has("send_sms")).toBe(false);
        expect(all.has("call_parent")).toBe(false);
        expect(all.has("upload_document")).toBe(false);
        expect(all.has("add_family_member")).toBe(false);
        expect(stages.new_inquiry).toContain("move_to_qualification");
    });
});
