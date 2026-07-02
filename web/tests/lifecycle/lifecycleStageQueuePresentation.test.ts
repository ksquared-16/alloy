import { describe, expect, it } from "vitest";
import {
    buildLifecycleWaitlistStageQueueDefinition,
    resolveLifecycleStageQueuePresentationMode,
} from "@/lib/lifecycle/lifecycleStageQueuePresentation";
import { buildLifecycleStageQueueDefinition } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { primaryQueueKeyForLifecycleStage } from "@/lib/lifecycle/lifecycleStageWorkUnit";

describe("lifecycleStageQueuePresentation", () => {
    it("resolves waitlist and enrollment presentation modes", () => {
        expect(resolveLifecycleStageQueuePresentationMode("waitlist")).toBe("waitlist_candidate");
        expect(resolveLifecycleStageQueuePresentationMode("enrollment")).toBe("child_grain");
        expect(resolveLifecycleStageQueuePresentationMode("lead")).toBe("standard_opportunity");
    });

    it("builds waitlist stage queue with candidate grain", () => {
        const doc = buildLifecycleWaitlistStageQueueDefinition({
            stageKey: "waitlist",
            label: "Waitlist",
            statusKeys: ["waitlisted"],
        });
        const qk = primaryQueueKeyForLifecycleStage("waitlist");
        const queues = doc.queues as { key: string; grain?: string; domain?: string }[];
        const row = queues.find((q) => q.key === qk);
        expect(row?.grain).toBe("candidate");
        expect(row?.domain).toBe("waitlist");
        const preview = (doc.ui as { row_preview?: { fields?: string[] } }).row_preview;
        expect(preview?.fields).toEqual(
            expect.arrayContaining([
                "phone",
                "email",
                "primary_contact",
                "child_name",
                "program",
                "start_date",
            ])
        );
        expect(preview?.fields).not.toContain("tour_date");
    });

    it("sets suppress_lifecycle_panel on stage queue definitions", () => {
        const doc = buildLifecycleStageQueueDefinition({
            stageKey: "lead",
            label: "Lead",
            statusKeys: ["new_inquiry"],
        });
        const ui = doc.ui as { suppress_lifecycle_panel?: boolean };
        expect(ui.suppress_lifecycle_panel).toBe(true);
    });

    it("routes waitlist through presentation builder on stage queue definition", () => {
        const doc = buildLifecycleStageQueueDefinition({
            stageKey: "waitlist",
            label: "Waitlist lane",
            statusKeys: ["waitlisted"],
        });
        const qk = primaryQueueKeyForLifecycleStage("waitlist");
        const queues = doc.queues as { key: string; grain?: string }[];
        expect(queues.find((q) => q.key === qk)?.grain).toBe("candidate");
    });

    it("keeps standard opportunity grain for lead stage", () => {
        const doc = buildLifecycleStageQueueDefinition({
            stageKey: "lead",
            label: "New Leads",
            statusKeys: ["new_inquiry"],
        });
        const qk = primaryQueueKeyForLifecycleStage("lead");
        const queues = doc.queues as { key: string; grain?: string }[];
        expect(queues.find((q) => q.key === qk)?.grain).toBe("case");
    });
});
