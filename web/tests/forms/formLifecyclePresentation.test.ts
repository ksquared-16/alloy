import { describe, expect, it } from "vitest";
import {
    buildFormLifecycleSteps,
    formLifecyclePublishSummaryLabel,
    FORM_LIFECYCLE_ANCHORS,
} from "@/lib/forms/formLifecyclePresentation";

describe("formLifecyclePresentation OW-3", () => {
    it("buildFormLifecycleSteps returns six lifecycle steps", () => {
        const steps = buildFormLifecycleSteps({
            hasDraft: true,
            hasPublished: true,
            activeLinkCount: 2,
            submissionCount: 5,
            submittedCount: 3,
            documentGenerationConfigured: true,
        });
        expect(steps).toHaveLength(6);
        expect(steps.map((s) => s.key)).toEqual([
            "design",
            "publish",
            "distribute",
            "intake",
            "review",
            "documents",
        ]);
    });

    it("marks publish as active when draft exists without published", () => {
        const steps = buildFormLifecycleSteps({
            hasDraft: true,
            hasPublished: false,
            activeLinkCount: 0,
            submissionCount: 0,
            submittedCount: 0,
            documentGenerationConfigured: false,
        });
        expect(steps.find((s) => s.key === "publish")?.state).toBe("active");
        expect(steps.find((s) => s.key === "distribute")?.state).toBe("pending");
    });

    it("formLifecyclePublishSummaryLabel reflects draft and published", () => {
        expect(formLifecyclePublishSummaryLabel(true, true)).toBe("Published · draft in progress");
        expect(formLifecyclePublishSummaryLabel(false, true)).toBe("Published");
        expect(formLifecyclePublishSummaryLabel(true, false)).toBe("Draft only");
    });

    it("exposes stable lifecycle anchors", () => {
        expect(FORM_LIFECYCLE_ANCHORS.design).toBe("lifecycle-design");
        expect(FORM_LIFECYCLE_ANCHORS.documents).toBe("lifecycle-documents");
    });
});
