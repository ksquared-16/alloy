import { describe, expect, it } from "vitest";
import {
    ACTION_BUTTON_CREATE_TITLE,
    actionDefinitionOwnership,
    filterCatalogDefinitionsForEntity,
    filterSettingsActionCatalogDefinitions,
    formatCatalogOptionLabel,
    settingsActionCatalogDefinitions,
} from "@/lib/admin/actions/actionButtonCreateUi";

describe("actionButtonCreateUi", () => {
    it("exposes create-from-catalog copy", () => {
        expect(ACTION_BUTTON_CREATE_TITLE).toContain("action button");
    });

    it("filters catalog by entity type when set", () => {
        const defs = [
            { id: "1", key: "a", label: "A", action_type: "ui_intent", entity_type: "opportunity", org_id: null },
            { id: "2", key: "b", label: "B", action_type: "ui_intent", entity_type: "job", org_id: null },
            { id: "3", key: "c", label: "C", action_type: "ui_intent", entity_type: null, org_id: null },
        ];
        const filtered = filterCatalogDefinitionsForEntity(defs, "opportunity");
        expect(filtered.map((d) => d.key)).toEqual(["a", "c"]);
    });

    it("labels platform vs org in catalog options", () => {
        expect(
            formatCatalogOptionLabel({
                id: "1",
                key: "send_quote",
                label: "Send quote",
                action_type: "ui_intent",
                entity_type: "opportunity",
                org_id: null,
            })
        ).toContain("Built-in");
        expect(actionDefinitionOwnership({ org_id: "org-1" })).toBe("org");
        expect(actionDefinitionOwnership({ org_id: null })).toBe("platform");
    });

    it("hides placeholder actions from Settings catalog", () => {
        const defs = [
            { id: "1", key: "open_record", label: "Open record", action_type: "open_drawer", entity_type: "opportunity", org_id: null },
            { id: "2", key: "send_message_placeholder", label: "Message", action_type: "ui_intent", entity_type: "opportunity", org_id: null },
            { id: "3", key: "add_to_waitlist_placeholder", label: "Add to waitlist", action_type: "ui_intent", entity_type: "opportunity", org_id: null },
            { id: "4", key: "schedule_tour", label: "Schedule tour", action_type: "start_workflow", entity_type: "opportunity", org_id: null },
        ];
        const filtered = filterSettingsActionCatalogDefinitions(defs);
        expect(filtered.map((d) => d.key)).toEqual(["open_record", "schedule_tour"]);
        const forOpp = settingsActionCatalogDefinitions(defs, "opportunity");
        expect(forOpp.map((d) => d.key)).toEqual(["open_record", "schedule_tour"]);
    });
});
