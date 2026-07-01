/**
 * Layout V2 — entity key mapping + label resolution.
 */

import { describe, expect, it } from "vitest";
import { fieldEntityKey } from "@/lib/layout/entityKeys";
import { entityTypeLabel, humanizeEntityType } from "@/lib/layout/entityLabels";

describe("fieldEntityKey (canonical plural → field singular)", () => {
    it("maps the seven field-backed entities to singular", () => {
        expect(fieldEntityKey("opportunities")).toBe("opportunity");
        expect(fieldEntityKey("persons")).toBe("person");
        expect(fieldEntityKey("customers")).toBe("customer");
        expect(fieldEntityKey("jobs")).toBe("job");
        expect(fieldEntityKey("vendors")).toBe("vendor");
        expect(fieldEntityKey("schedules")).toBe("schedule");
        expect(fieldEntityKey("locations")).toBe("location");
    });
    it("leaves entities without a field surface unchanged", () => {
        expect(fieldEntityKey("contacts")).toBe("contacts");
        expect(fieldEntityKey("service_plan_templates")).toBe("service_plan_templates");
    });
});

describe("entityTypeLabel", () => {
    const labels = { opportunities: { singular: "Lead", plural: "Leads" } };

    it("prefers the configured label by canonical plural key", () => {
        expect(entityTypeLabel(labels, "opportunities")).toBe("Leads");
        expect(entityTypeLabel(labels, "opportunities", "singular")).toBe("Lead");
    });

    it("resolves via the singular alias when labels are keyed singular", () => {
        const singularKeyed = { opportunity: { singular: "Lead", plural: "Leads" } };
        expect(entityTypeLabel(singularKeyed, "opportunities")).toBe("Leads");
    });

    it("humanizes the raw key when no configured label exists", () => {
        expect(entityTypeLabel({}, "opportunities")).toBe("Opportunities");
        expect(humanizeEntityType("service_plan_templates")).toBe("Service Plan Templates");
    });
});
