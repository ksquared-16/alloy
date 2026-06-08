import { describe, expect, it } from "vitest";

import { buildMyTasksRecordContextLines, resolveMyTasksEntityLabel } from "@/lib/agent/taskAssist/myTasksRecordContextPresentation";
import { buildMyTasksPresentationLabels } from "@/lib/agent/taskAssist/myTasksPresentationLabels";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";

const oppUuid = "33333333-3333-4333-8333-333333333333";

const leadLabels: EntityLabelsMap = {
    opportunities: { singular: "Lead", plural: "Leads" },
};

function task(overrides: Partial<MyTasksTaskRow> = {}): MyTasksTaskRow {
    return {
        id: "66666666-6666-4666-8666-666666666666",
        title: "Follow up",
        description: null,
        due_at: "2026-06-01T12:00:00.000Z",
        status: "open",
        source: "task_assist",
        entity_id: oppUuid,
        entity_type: "opportunities",
        created_at: "2026-05-01T12:00:00.000Z",
        ...overrides,
    };
}

describe("myTasksRecordContextPresentation", () => {
    const presentation = buildMyTasksPresentationLabels(leadLabels, "Guardian");

    it("resolveMyTasksEntityLabel uses enrichment or Linked record fallback", () => {
        expect(resolveMyTasksEntityLabel(task({ entity_label: "Hayes lead" }), leadLabels)).toBe("Hayes lead");
        expect(resolveMyTasksEntityLabel(task(), leadLabels)).toBe("Linked record");
    });

    it("rewrites inquiry language in entity labels", () => {
        expect(
            resolveMyTasksEntityLabel(task({ entity_label: "Mitchell / South Campus" }), leadLabels)
        ).toBe("Mitchell / South Campus");
        const rewritten = resolveMyTasksEntityLabel(task({ entity_label: "Family inquiry" }), leadLabels);
        expect(rewritten.toLowerCase()).not.toContain("inquiry");
    });

    it("never surfaces raw UUIDs as labels", () => {
        expect(resolveMyTasksEntityLabel(task({ entity_label: oppUuid }), leadLabels)).toBe("Linked record");
        const lines = buildMyTasksRecordContextLines(
            task({ household_label: oppUuid, contact_label: oppUuid }),
            presentation,
            leadLabels
        );
        expect(lines.householdLabel).toBeNull();
    });

    it("uses Lead entity type label and Guardian contact prefix", () => {
        const lines = buildMyTasksRecordContextLines(
            task({
                entity_label: "Tour follow-up",
                household_label: "Hayes Family",
                contact_label: "Jamie Hayes",
                status_label: "New lead",
                children_labels: ["Sam Hayes"],
            }),
            presentation,
            leadLabels
        );
        expect(lines.entityTypeLabel).toBe("Lead");
        expect(lines.entityTypeLabel.toLowerCase()).not.toContain("inquiry");
        expect(lines.guardianFieldLabel).toBe("Guardian");
        expect(lines.childrenDisplay).toBe("Sam Hayes");
        expect(lines.childFieldLabel).toBe("Child");
    });

    it("shows context block only for linked opportunity tasks", () => {
        const lines = buildMyTasksRecordContextLines(task(), presentation, leadLabels);
        expect(lines.entityLabel).toBe("Linked record");
        expect(lines.showContextBlock).toBe(true);

        const general = buildMyTasksRecordContextLines(
            task({ entity_type: null, entity_id: null }),
            presentation,
            leadLabels
        );
        expect(general.showContextBlock).toBe(false);
    });
});
