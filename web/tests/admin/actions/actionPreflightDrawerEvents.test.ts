import { describe, expect, it } from "vitest";
import {
    ADMINV2_ACTION_PREFLIGHT_BLOCKED,
    parseActionPreflightBlockedDetail,
} from "@/lib/admin/actions/actionPreflightDrawerEvents";

describe("actionPreflightDrawerEvents", () => {
    it("parses structured action_preflight blocked detail", () => {
        const ev = new CustomEvent(ADMINV2_ACTION_PREFLIGHT_BLOCKED, {
            detail: {
                action_key: "approve_enrollment",
                opportunity_id: "opp-1",
                action_preflight: {
                    action_key: "approve_enrollment",
                    title: "Approve enrollment — requirements",
                    summary: "Blocked",
                    blocking: [
                        {
                            field_key: "schedule_type",
                            label: "Schedule",
                            reason: "Schedule is required.",
                            source: "action",
                        },
                    ],
                    recommended: [],
                    completion_requirements: {
                        ok: false,
                        blocking: [],
                        warnings: [],
                        recommendations: [],
                    },
                    effective_requirements: {
                        ok: false,
                        blocking: [],
                        recommended: [],
                        autoPopulate: [],
                        sourceSummary: {
                            layoutRules: 0,
                            actionRules: 1,
                            transitionRules: 0,
                            completionRules: 0,
                        },
                    },
                },
            },
        });

        const parsed = parseActionPreflightBlockedDetail(ev);
        expect(parsed?.opportunity_id).toBe("opp-1");
        expect(parsed?.action_preflight?.blocking[0]?.label).toBe("Schedule");
        expect(parsed?.action_preflight?.blocking[0]?.reason).toContain("Schedule");
    });

    it("returns null when opportunity_id or action_key missing", () => {
        const ev = new CustomEvent(ADMINV2_ACTION_PREFLIGHT_BLOCKED, {
            detail: { action_key: "", opportunity_id: "opp-1" },
        });
        expect(parseActionPreflightBlockedDetail(ev)).toBeNull();
    });
});
