import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueueRowPlacementPriorityStrip } from "@/app/adminV2/components/workspace/blocks/QueueRowPlacementPriorityStrip";
import type { QueueRowPlacementPriorityVm } from "@/lib/ui-v2/workspace-types";

const baseVm = (over: Partial<QueueRowPlacementPriorityVm>): QueueRowPlacementPriorityVm => ({
    priorityRuleLabel: "Standard family",
    programGroupSectionTitle: "Toddler",
    waitlistProgramShortLabel: "Toddler waitlist",
    reasonLines: [],
    warningLines: [],
    shadowMode: false,
    ...over,
});

describe("QueueRowPlacementPriorityStrip", () => {
    it("shadow mode shows only rule chip — no # badge or row footnote", () => {
        const preview = baseVm({
            priorityRuleLabel: "Sibling enrolled at center",
            programGroupSectionTitle: "Infant",
            waitlistProgramShortLabel: "Infant waitlist",
            shadowMode: true,
        });
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html).toContain("Sibling enrolled at center");
        expect(html).not.toContain("adminv2-ws-queue-placement-position");
        expect(html).not.toContain("adminv2-ws-queue-placement-strip__shadow-note");
        expect(html.toLowerCase()).not.toMatch(/pagination|evaluation|projection|sort_tuple/);
    });

    it("non-shadow shows #n, short program label, and rule chip", () => {
        const preview = baseVm({
            priorityRuleLabel: "Staff / community priority",
            programGroupSectionTitle: "Toddler",
            waitlistProgramShortLabel: "Toddler waitlist",
            scopedWaitlistPosition: 1,
            scopedWaitlistPositionLabel: "Toddler waitlist",
            shadowMode: false,
        });
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html).toContain("adminv2-ws-queue-placement-position");
        expect(html).toContain("#1");
        expect(html).toContain("Toddler waitlist");
        expect(html).toContain("Staff / community priority");
        expect(html).not.toContain("adminv2-ws-queue-placement-strip__shadow-note");
    });

    it("shows at most one supporting reason line", () => {
        const preview = baseVm({
            priorityReasonShort: "Priority rule matched.",
            reasonLines: ["Priority rule matched."],
            shadowMode: false,
        });
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html).toContain("adminv2-ws-queue-placement-strip__reason-one");
        expect(html).toContain("Priority rule matched.");
    });

    it("compact warning uses dot with title, not paragraph list", () => {
        const preview = baseVm({
            warningLines: ["Sibling enrollment could not be verified."],
            shadowMode: false,
        });
        const html = renderToStaticMarkup(<QueueRowPlacementPriorityStrip preview={preview} />);
        expect(html).toContain("adminv2-ws-queue-placement-strip__warn-dot");
        expect(html).not.toContain("<ul");
        expect(html).toContain("Sibling enrollment could not be verified.");
    });

    it("error path stays compact", () => {
        const preview: QueueRowPlacementPriorityVm = {
            priorityRuleLabel: "",
            programGroupSectionTitle: "Program / room not specified",
            waitlistProgramShortLabel: "Program waitlist",
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
