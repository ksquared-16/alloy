import { describe, expect, it } from "vitest";

import {
    bosOpportunityContextKindPrefix,
    resolveBosCommandSurfaceContextLabel,
} from "@/lib/bos/bosCommandSurfaceContextPresentation";

describe("bosCommandSurfaceContextPresentation", () => {
    it("maps inquiry/opportunity singular to Lead prefix", () => {
        expect(bosOpportunityContextKindPrefix("Inquiry")).toBe("Lead");
        expect(bosOpportunityContextKindPrefix("Opportunity")).toBe("Lead");
    });

    it("prefers surface operational label", () => {
        expect(
            resolveBosCommandSurfaceContextLabel({
                currentContext: null,
                workspaceScope: null,
                surfaceOperationalLabel: "Child — James Patter",
            })
        ).toBe("Child — James Patter");
    });

    it("formats opportunity context as Lead — name", () => {
        expect(
            resolveBosCommandSurfaceContextLabel({
                currentContext: {
                    entity_type: "opportunities",
                    entity_id: "1",
                    label: "Jimmy Patter",
                    source_surface: "opportunity_drawer",
                },
                workspaceScope: null,
                surfaceOperationalLabel: null,
                opportunitySingular: "Inquiry",
            })
        ).toBe("Lead — Jimmy Patter");
    });

    it("formats work unit workspace scope", () => {
        expect(
            resolveBosCommandSurfaceContextLabel({
                currentContext: null,
                workspaceScope: {
                    department_id: "d1",
                    work_unit_id: "wu1",
                    work_unit_name: "New Leads",
                },
                surfaceOperationalLabel: null,
            })
        ).toBe("Work Unit — New Leads");
    });
});
