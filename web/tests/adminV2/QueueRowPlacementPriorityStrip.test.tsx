import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueueRowPlacementPriorityStrip } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityStrip";
import type { QueueRowPlacementPriorityVm } from "@/lib/ui-v2/workspace-types";

describe("QueueRowPlacementPriorityStrip", () => {
    it("renders cohort chip and reason lines when preview is valid", () => {
        const preview: QueueRowPlacementPriorityVm = {
            cohortLabel: "Sibling enrolled at center",
            reasonLines: ["Placement tier matched enrollment priority rules."],
            warningLines: [],
            shadowMode: true,
        };
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html).toContain("Placement priority");
        expect(html).toContain("Sibling enrolled at center");
        expect(html).toContain("data-queue-placement=\"preview\"");
        expect(html.toLowerCase()).not.toMatch(/\brank\b|\#\d|top of waitlist/i);
    });

    it("renders nothing like global rank for shadow preview copy", () => {
        const preview: QueueRowPlacementPriorityVm = {
            cohortLabel: "General waitlist",
            reasonLines: [],
            warningLines: [],
            shadowMode: true,
        };
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html).toContain("Preview only");
        expect(html.toLowerCase()).not.toMatch(/\bglobal\b.*\bsort\b|full waitlist order/i);
    });

    it("shows warning lines when present", () => {
        const preview: QueueRowPlacementPriorityVm = {
            cohortLabel: "General waitlist",
            reasonLines: [],
            warningLines: ["Fact could not be verified."],
            shadowMode: false,
        };
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html).toContain("Placement warnings");
        expect(html).toContain("Fact could not be verified.");
    });

    it("error path shows subdued label without cohort chip text", () => {
        const preview: QueueRowPlacementPriorityVm = {
            cohortLabel: "",
            reasonLines: [],
            warningLines: [],
            shadowMode: false,
            evaluateError: true,
            errorMessage: "UNSUPPORTED_COHORT",
        };
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html).toContain("data-queue-placement=\"error\"");
        expect(html).toContain("UNSUPPORTED_COHORT");
        expect(html).not.toContain("adminv2-ws-queue-placement-cohort-chip");
    });
});
