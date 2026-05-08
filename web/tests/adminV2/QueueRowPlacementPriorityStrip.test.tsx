import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueueRowPlacementPriorityStrip } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityStrip";
import type { QueueRowPlacementPriorityVm } from "@/lib/ui-v2/workspace-types";

describe("QueueRowPlacementPriorityStrip", () => {
    it("shadow mode does not render scoped waitlist position badge", () => {
        const preview: QueueRowPlacementPriorityVm = {
            priorityRuleLabel: "Sibling enrolled at center",
            programGroupSectionTitle: "Infant",
            reasonLines: [],
            warningLines: [],
            shadowMode: true,
        };
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html).toContain("Waitlist priority");
        expect(html).not.toContain("adminv2-ws-queue-placement-position");
        expect(html.toLowerCase()).toMatch(/position numbers stay off/i);
    });

    it("non-shadow mode shows #n and Position in … waitlist caption", () => {
        const preview: QueueRowPlacementPriorityVm = {
            priorityRuleLabel: "Staff / community priority",
            programGroupSectionTitle: "Toddler",
            scopedWaitlistPosition: 1,
            scopedWaitlistPositionLabel: "Position in Toddler waitlist",
            reasonLines: [],
            warningLines: [],
            shadowMode: false,
        };
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html).toContain("adminv2-ws-queue-placement-position");
        expect(html).toContain("#1");
        expect(html).toContain("Position in Toddler waitlist");
        expect(html).toContain("adminv2-ws-queue-placement-strip__position-caption");
    });

    it("non-shadow hint copy avoids implying global full-waitlist accuracy", () => {
        const preview: QueueRowPlacementPriorityVm = {
            priorityRuleLabel: "Standard family",
            programGroupSectionTitle: "Infant",
            scopedWaitlistPosition: 2,
            scopedWaitlistPositionLabel: "Position in Infant waitlist",
            reasonLines: [],
            warningLines: [],
            shadowMode: false,
        };
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html.toLowerCase()).not.toMatch(/\bglobal\b.*\bfull\b.*\bwaitlist\b|guaranteed.*spot/i);
    });

    it("shows warning lines when present", () => {
        const preview: QueueRowPlacementPriorityVm = {
            priorityRuleLabel: "Standard family",
            programGroupSectionTitle: "Toddler",
            reasonLines: [],
            warningLines: ["Fact could not be verified."],
            shadowMode: false,
        };
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html).toContain("Waitlist priority warnings");
        expect(html).toContain("Fact could not be verified.");
    });

    it("error path shows subdued label without rule chip text", () => {
        const preview: QueueRowPlacementPriorityVm = {
            priorityRuleLabel: "",
            programGroupSectionTitle: "Program / room not specified",
            reasonLines: [],
            warningLines: [],
            shadowMode: false,
            evaluateError: true,
            errorMessage: "UNSUPPORTED_COHORT",
        };
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html).toContain("data-queue-placement=\"error\"");
        expect(html).toContain("UNSUPPORTED_COHORT");
        expect(html).not.toContain("adminv2-ws-queue-placement-rule-chip");
    });
});
