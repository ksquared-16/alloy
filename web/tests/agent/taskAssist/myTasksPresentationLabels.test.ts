import { describe, expect, it } from "vitest";

import {
    buildMyTasksPresentationLabels,
    myTasksRowMatchesSearch,
    resolveMyTasksChildFieldLabel,
    resolveMyTasksGuardianFieldLabelFromRoleTypes,
} from "@/lib/agent/taskAssist/myTasksPresentationLabels";
import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";

const leadLabels: EntityLabelsMap = {
    opportunities: { singular: "Lead", plural: "Leads" },
};

describe("myTasksPresentationLabels", () => {
    it("uses configured Lead entity label not inquiry", () => {
        const p = buildMyTasksPresentationLabels(leadLabels);
        expect(p.opportunityEntitySingular).toBe("Lead");
        expect(p.opportunityEntitySingular.toLowerCase()).not.toBe("inquiry");
    });

    it("resolves guardian label from role types", () => {
        expect(
            resolveMyTasksGuardianFieldLabelFromRoleTypes([{ key: "guardian", label: "Guardian" }])
        ).toBe("Guardian");
        expect(resolveMyTasksGuardianFieldLabelFromRoleTypes([])).toBe("Guardian");
    });

    it("uses Child/Children when inquiry_child label contains inquiry", () => {
        expect(resolveMyTasksChildFieldLabel(leadLabels, 1)).toBe("Child");
        expect(resolveMyTasksChildFieldLabel(leadLabels, 2)).toBe("Children");
    });

    it("myTasksRowMatchesSearch finds tasks by child and lead label fields", () => {
        const task = {
            title: "Follow up",
            source: "task_assist",
            entity_label: "Chen family lead",
            household_label: "Chen Family",
            contact_label: "Jamie Chen",
            status_label: "New lead",
            children_labels: ["Avery Chen"],
        };
        expect(myTasksRowMatchesSearch(task, "avery", leadLabels)).toBe(true);
        expect(myTasksRowMatchesSearch(task, "chen family", leadLabels)).toBe(true);
        expect(myTasksRowMatchesSearch(task, "nomatch", leadLabels)).toBe(false);
    });
});
