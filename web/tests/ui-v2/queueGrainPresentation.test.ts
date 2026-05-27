import { describe, expect, it } from "vitest";

import { loadQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2 } from "@/lib/config/enrollmentPipelineQueueDefinitionV2";
import {
    formatQueueCountAriaLabel,
    formatQueueCountLabel,
    resolveQueueCountUnit,
    resolveQueueGrainPresentation,
} from "@/lib/ui-v2/queueGrainPresentation";

const v2 = loadQueueDefinitionBundle(RAW_ENROLLMENT_PIPELINE_QUEUE_DEFINITION_V2).normalized;

describe("queueGrainPresentation", () => {
    it("case grain uses families", () => {
        expect(resolveQueueCountUnit({ grain: "case" }).unit).toBe("families");
        expect(formatQueueCountLabel(12, { grain: "case" })).toBe("12 families");
    });

    it("child grain uses children", () => {
        expect(resolveQueueCountUnit({ grain: "child", domain: "enrollment_offers" }).unit).toBe("children");
        expect(formatQueueCountLabel(7, { grain: "child" })).toBe("7 children");
    });

    it("waitlist candidate grain uses children on waitlist phrasing", () => {
        const input = { grain: "candidate" as const, domain: "waitlist" };
        expect(resolveQueueCountUnit(input).countPhrase).toBe("children on waitlist");
        expect(formatQueueCountLabel(18, input)).toBe("18 children");
        expect(formatQueueCountAriaLabel(18, "Waitlist", input)).toContain("on waitlist");
    });

    it("overlay uses items", () => {
        expect(resolveQueueCountUnit({ overlay: true }).unit).toBe("items");
        expect(formatQueueCountLabel(9, { overlay: true })).toBe("9 items");
    });

    it("unknown grain falls back to families", () => {
        expect(resolveQueueCountUnit({ grain: "unknown" }).unit).toBe("families");
    });

    it("config-derived waitlist grain from v2 bundle", () => {
        const waitlist = v2.queues.find((q) => q.key === "waitlist")!;
        const pres = resolveQueueGrainPresentation({ key: "waitlist", label: "Waitlist" }, v2);
        expect(pres.grain).toBe("candidate");
        expect(pres.domain).toBe("waitlist");
        expect(resolveQueueCountUnit(pres).unit).toBe("children");
    });

    it("enrollment offers config uses child grain labels even before child SQL runtime", () => {
        const offers = v2.queues.find((q) => q.key === "enrollment_offers")!;
        const pres = resolveQueueGrainPresentation({ key: offers.key, label: offers.label }, v2);
        expect(pres.grain).toBe("child");
        expect(formatQueueCountLabel(3, pres)).toBe("3 children");
    });
});
