import { describe, expect, it } from "vitest";

import {
    ACTION_BUTTON_LIBRARY,
    filterSettingsActionCatalogDefinitions,
} from "@/lib/admin/actions/actionDefinitionRegistry";

describe("actionDefinitionRegistry", () => {
    it("hides placeholders and unknown platform keys from Settings catalog", () => {
        const defs = [
            { id: "1", key: "open_record", label: "Open", action_type: "open_drawer", entity_type: "opportunity", org_id: null },
            { id: "2", key: "send_message_placeholder", label: "Message", action_type: "ui_intent", entity_type: "opportunity", org_id: null },
            { id: "3", key: "update_status_add_note", label: "Update status", action_type: "open_form", entity_type: "opportunity", org_id: null },
            { id: "4", key: "mystery_platform", label: "Mystery", action_type: "ui_intent", entity_type: "opportunity", org_id: null },
            { id: "5", key: "custom_org_action", label: "Custom", action_type: "ui_intent", entity_type: "opportunity", org_id: "org-1" },
        ];
        const filtered = filterSettingsActionCatalogDefinitions(defs);
        // Legacy update_status_add_note is settingsConfigurable:false and capability catalogVisibility:hidden.
        expect(filtered.map((d) => d.key).sort()).toEqual(["custom_org_action", "open_record"].sort());
    });

    it("includes ask_bos and quick_message in library", () => {
        const keys = new Set(ACTION_BUTTON_LIBRARY.map((e) => e.key));
        expect(keys.has("quick_message")).toBe(true);
        expect(keys.has("ask_bos")).toBe(true);
    });
});
